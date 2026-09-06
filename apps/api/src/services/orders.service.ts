import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  AppError,
  type CreateOrderInput,
  type OrderView,
  type ShopCategoryFilter,
  type ShopItemView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { orderItems, orders, shopItems } from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { debit } from "./ledger.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Boutique et commandes (CDC §12).
 *
 * Un achat crée toujours une commande et ses lignes : le simple débit du
 * prototype rendait l'historique et le suivi de livraison impossibles (§24).
 * Commande, lignes, débit et écriture au registre sont dans une seule
 * transaction (TECH-003, SHOP-003).
 */

function toItemView(row: typeof shopItems.$inferSelect): ShopItemView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceUno: row.priceUno,
    priceEuros: row.priceEuros === null ? null : Number(row.priceEuros),
    images: Array.isArray(row.images) ? row.images : [],
    productUrl: row.productUrl,
    available: row.available,
    stock: row.stock,
  };
}

/** Catalogue joueur : seuls les produits disponibles et non archivés (SHOP-001). */
export async function listShopItems(
  executor: Executor,
  category: ShopCategoryFilter,
): Promise<ShopItemView[]> {
  const conditions = [eq(shopItems.available, true), eq(shopItems.archived, false)];
  if (category !== "all") {
    conditions.push(eq(shopItems.category, category));
  }

  const rows = await executor
    .select()
    .from(shopItems)
    .where(and(...conditions))
    .orderBy(desc(shopItems.createdAt));

  return rows.map(toItemView);
}

export async function getShopItem(
  executor: Executor,
  shopItemId: number,
): Promise<ShopItemView> {
  const [row] = await executor
    .select()
    .from(shopItems)
    .where(eq(shopItems.id, shopItemId))
    .limit(1);

  if (!row || row.archived) {
    throw new AppError("NOT_FOUND", "Ce produit est introuvable.");
  }
  return toItemView(row);
}

/** Verrouille les produits commandés, dans un ordre stable anti-interblocage. */
async function lockItems(
  tx: Transaction,
  ids: number[],
): Promise<Map<number, typeof shopItems.$inferSelect>> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const map = new Map<number, typeof shopItems.$inferSelect>();

  for (const id of sorted) {
    const [row] = await tx
      .select()
      .from(shopItems)
      .where(eq(shopItems.id, id))
      .for("update");
    if (row) map.set(id, row);
  }
  return map;
}

export interface CreateOrderResult {
  order: OrderView;
  balanceAfter: number;
  replayed: boolean;
}

/**
 * Achat (SHOP-003, SHOP-005, STATE-002).
 *
 * Le prix est relu en base : un prix envoyé par le client est ignoré.
 * En cas de solde insuffisant, l'exception remonte avant toute écriture et la
 * transaction est annulée — état de la base rigoureusement inchangé.
 */
export async function createOrder(
  actor: { playerId: number; userId: number },
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  // Un double tap ne débite qu'une fois : la commande existante est renvoyée.
  const [alreadyPlaced] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (alreadyPlaced) {
    const order = await getOrder(db, actor.playerId, alreadyPlaced.id);
    return { order, balanceAfter: -1, replayed: true };
  }

  return db.transaction(async (tx) => {
    const requested = input.items.map((item) => ({
      shopItemId: item.shopItemId,
      quantity: item.quantity,
    }));

    const locked = await lockItems(
      tx,
      requested.map((item) => item.shopItemId),
    );

    let totalUno = 0;
    const lines: {
      shopItemId: number;
      productNameSnapshot: string;
      unitPriceUno: number;
      quantity: number;
      totalUno: number;
    }[] = [];

    for (const item of requested) {
      const product = locked.get(item.shopItemId);
      // Produit désactivé ou supprimé entre l'affichage et l'achat (§21.1).
      if (!product || product.archived || !product.available) {
        throw new AppError("PRODUCT_UNAVAILABLE");
      }
      if (product.stock !== null && product.stock < item.quantity) {
        throw new AppError(
          "PRODUCT_UNAVAILABLE",
          `Stock insuffisant pour « ${product.name} ».`,
        );
      }

      const lineTotal = product.priceUno * item.quantity;
      totalUno += lineTotal;
      lines.push({
        shopItemId: product.id,
        productNameSnapshot: product.name,
        unitPriceUno: product.priceUno,
        quantity: item.quantity,
        totalUno: lineTotal,
      });
    }

    let orderId: number;
    try {
      const inserted = await tx.insert(orders).values({
        playerId: actor.playerId,
        status: "pending",
        totalUno,
        idempotencyKey: input.idempotencyKey,
      });
      orderId = Number(inserted[0].insertId);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("CONFLICT", "Cet achat est déjà en cours de traitement.");
      }
      throw error;
    }

    await tx.insert(orderItems).values(
      lines.map((line) => ({ ...line, orderId })),
    );

    // Lève INSUFFICIENT_FUNDS si le solde ne couvre pas le total : toute la
    // transaction est alors annulée, commande incluse (SHOP-005).
    const payment = await debit(tx, {
      playerId: actor.playerId,
      amount: totalUno,
      type: "purchase",
      description:
        lines.length === 1 && lines[0]
          ? `Achat : ${lines[0].productNameSnapshot}`
          : `Achat de ${lines.length} articles`,
      referenceType: "order",
      referenceId: orderId,
      idempotencyKey: `order:${orderId}`,
    });

    await tx
      .update(orders)
      .set({ status: "paid" })
      .where(eq(orders.id, orderId));

    for (const line of lines) {
      const product = locked.get(line.shopItemId);
      if (product?.stock !== null && product?.stock !== undefined) {
        await tx
          .update(shopItems)
          .set({ stock: product.stock - line.quantity, updatedAt: new Date() })
          .where(eq(shopItems.id, line.shopItemId));
      }
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "order.create",
      entityType: "order",
      entityId: orderId,
      after: { totalUno, lines: lines.length },
    });

    const order = await getOrder(tx, actor.playerId, orderId);
    return { order, balanceAfter: payment.balanceAfter, replayed: false };
  });
}

export async function getOrder(
  executor: Executor,
  playerId: number,
  orderId: number,
): Promise<OrderView> {
  const [order] = await executor
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.playerId, playerId)))
    .limit(1);

  // ROLE-002 : une commande d'un autre joueur est traitée comme inexistante.
  if (!order) throw new AppError("NOT_FOUND", "Cette commande est introuvable.");

  const lines = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return {
    id: order.id,
    status: order.status,
    totalUno: order.totalUno,
    createdAt: order.createdAt.toISOString(),
    fulfilledAt: order.fulfilledAt ? order.fulfilledAt.toISOString() : null,
    items: lines.map((line) => ({
      shopItemId: line.shopItemId,
      productName: line.productNameSnapshot,
      unitPriceUno: line.unitPriceUno,
      quantity: line.quantity,
      totalUno: line.totalUno,
    })),
  };
}

/** Historique des commandes du joueur (SHOP-004). */
export async function listOrders(
  executor: Executor,
  params: { playerId: number; limit: number; cursor?: number | null },
): Promise<{ items: OrderView[]; nextCursor: number | null }> {
  const rows = await executor
    .select()
    .from(orders)
    .where(
      params.cursor
        ? and(eq(orders.playerId, params.playerId), lt(orders.id, params.cursor))
        : eq(orders.playerId, params.playerId),
    )
    .orderBy(desc(orders.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  const lines = page.length
    ? await executor
        .select()
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            page.map((order) => order.id),
          ),
        )
    : [];

  const byOrder = new Map<number, typeof lines>();
  for (const line of lines) {
    const bucket = byOrder.get(line.orderId) ?? [];
    bucket.push(line);
    byOrder.set(line.orderId, bucket);
  }

  return {
    items: page.map((order) => ({
      id: order.id,
      status: order.status,
      totalUno: order.totalUno,
      createdAt: order.createdAt.toISOString(),
      fulfilledAt: order.fulfilledAt ? order.fulfilledAt.toISOString() : null,
      items: (byOrder.get(order.id) ?? []).map((line) => ({
        shopItemId: line.shopItemId,
        productName: line.productNameSnapshot,
        unitPriceUno: line.unitPriceUno,
        quantity: line.quantity,
        totalUno: line.totalUno,
      })),
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Vrai si le produit apparaît dans au moins une commande (ADMIN-004). */
export async function isProductOrdered(
  executor: Executor,
  shopItemId: number,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.shopItemId, shopItemId))
    .limit(1);
  return Boolean(row);
}
