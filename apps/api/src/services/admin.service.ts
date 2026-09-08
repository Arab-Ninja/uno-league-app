import { and, count, desc, eq, like, ne, or, sql } from "drizzle-orm";
import {
  AppError,
  type AccountType,
  type AdminAdjustUnoInput,
  type Division,
  type ShopItemInput,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  auditLogs,
  matches,
  orders,
  players,
  proposalParticipants,
  proposals,
  shopItems,
  teams,
  transactions,
  users,
} from "../db/schema.js";
import { assertValidImageUrl } from "../storage/index.js";
import { writeAudit } from "./audit.service.js";
import { credit, debit } from "./ledger.service.js";
import { isProductOrdered } from "./orders.service.js";

/**
 * Console d'administration (CDC §15).
 *
 * Toutes ces fonctions sont exposées uniquement via `adminProcedure`, qui
 * vérifie `users.role = 'admin'` côté serveur (ADMIN-001). Aucun identifiant
 * d'administration n'existe dans le bundle client.
 *
 * Chaque mutation sensible est auditée avec son acteur et les valeurs
 * avant/après (ADMIN-005).
 */

export async function databaseStats(executor: Executor) {
  const tables = {
    users,
    players,
    proposals,
    proposalParticipants,
    transactions,
    teams,
    matches,
    shopItems,
    orders,
  } as const;

  const entries = await Promise.all(
    (Object.keys(tables) as (keyof typeof tables)[]).map(async (key) => {
      const [row] = await executor.select({ total: count() }).from(tables[key]);
      return [key, Number(row?.total ?? 0)] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<keyof typeof tables, number>;
}

export async function listPlayers(
  executor: Executor,
  params: {
    query?: string | undefined;
    division?: Division | undefined;
    limit: number;
    cursor?: number | null;
  },
) {
  const conditions = [];
  if (params.query) {
    const needle = `%${params.query.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(
      or(like(players.displayName, needle), like(users.email, needle))!,
    );
  }
  if (params.division) conditions.push(eq(players.division, params.division));
  if (params.cursor) conditions.push(sql`${players.id} < ${params.cursor}`);

  const rows = await executor
    .select({
      id: players.id,
      displayName: players.displayName,
      email: users.email,
      role: users.role,
      status: users.status,
      division: players.division,
      unoPoints: players.unoPoints,
      level: players.level,
      xp: players.xp,
      goals: players.goals,
      assists: players.assists,
      createdAt: players.createdAt,
    })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(players.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  return {
    items: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Modification de division (ADMIN-003). */
export async function setDivision(
  actor: { userId: number },
  params: { playerId: number; division: Division; reason?: string | undefined },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [player] = await tx
      .select({ division: players.division })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);

    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");
    if (player.division === params.division) return;

    await tx
      .update(players)
      .set({ division: params.division, updatedAt: new Date() })
      .where(eq(players.id, params.playerId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "player.division.update",
      entityType: "player",
      entityId: params.playerId,
      before: { division: player.division },
      after: { division: params.division, reason: params.reason ?? null },
    });
  });
}

/**
 * Corrige le type de compte d'un joueur (ROLE-003).
 *
 * Le choix se fait à l'inscription et n'est plus modifiable par l'intéressé :
 * un arbitre qui redeviendrait joueur du jour au lendemain rendrait
 * incohérentes les sessions qu'il a arbitrées. L'administration peut le
 * corriger — une erreur d'inscription arrive — mais pas quand une session à
 * venir compte déjà sur lui comme arbitre.
 */
export async function setAccountType(
  actor: { userId: number },
  params: {
    playerId: number;
    accountType: AccountType;
    reason?: string | undefined;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [player] = await tx
      .select({ accountType: players.accountType })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);

    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");
    if (player.accountType === params.accountType) return;

    if (player.accountType === "referee") {
      const [engaged] = await tx
        .select({ id: proposals.id })
        .from(proposals)
        .where(
          and(
            eq(proposals.refereePlayerId, params.playerId),
            ne(proposals.status, "completed"),
            ne(proposals.status, "cancelled"),
          ),
        )
        .limit(1);

      if (engaged) {
        throw new AppError(
          "RULE_VIOLATION",
          "Cet arbitre est engagé sur une session à venir. Retirez-le d'abord.",
        );
      }
    }

    await tx
      .update(players)
      .set({ accountType: params.accountType, updatedAt: new Date() })
      .where(eq(players.id, params.playerId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "player.type.update",
      entityType: "player",
      entityId: params.playerId,
      before: { accountType: player.accountType },
      after: { accountType: params.accountType, reason: params.reason ?? null },
    });
  });
}

/**
 * Ajustement de solde (ADMIN-002).
 * Le retrait passe par le registre : il est refusé si le solde est
 * insuffisant, au lieu d'être ramené à zéro comme dans le prototype (§24).
 */
export async function adjustUno(
  actor: { userId: number },
  input: AdminAdjustUnoInput,
): Promise<{ balanceAfter: number }> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ unoPoints: players.unoPoints })
      .from(players)
      .where(eq(players.id, input.playerId))
      .limit(1);

    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

    const entry =
      input.direction === "credit"
        ? await credit(tx, {
            playerId: input.playerId,
            amount: input.amount,
            type: "admin_credit",
            description: `Crédit administrateur — ${input.reason}`,
            referenceType: "admin",
            referenceId: actor.userId,
          })
        : await debit(tx, {
            playerId: input.playerId,
            amount: input.amount,
            type: "admin_debit",
            description: `Débit administrateur — ${input.reason}`,
            referenceType: "admin",
            referenceId: actor.userId,
          });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "player.uno.adjust",
      entityType: "player",
      entityId: input.playerId,
      before: { unoPoints: player.unoPoints },
      after: {
        unoPoints: entry.balanceAfter,
        direction: input.direction,
        amount: input.amount,
        reason: input.reason,
      },
    });

    return { balanceAfter: entry.balanceAfter };
  });
}

// ---------------------------------------------------------------------------
// Boutique (ADMIN-004)
// ---------------------------------------------------------------------------

export async function listAllShopItems(executor: Executor) {
  const rows = await executor
    .select()
    .from(shopItems)
    .orderBy(desc(shopItems.createdAt));

  return rows.map((row) => ({
    ...row,
    priceEuros: row.priceEuros === null ? null : Number(row.priceEuros),
    images: Array.isArray(row.images) ? row.images : [],
    // La colonne est nullable en base — une colonne JSON ajoutée par ALTER ne
    // peut pas être remplie rétroactivement. La vue, elle, ne l'est jamais :
    // un tableau vide signifie « toutes les tailles du barème ».
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createShopItem(
  actor: { userId: number },
  input: ShopItemInput,
): Promise<number> {
  for (const url of input.images) assertValidImageUrl(url);
  if (input.productUrl) assertValidImageUrl(input.productUrl);

  return db.transaction(async (tx) => {
    const inserted = await tx.insert(shopItems).values({
      name: input.name,
      description: input.description,
      category: input.category,
      priceUno: input.priceUno,
      priceEuros: input.priceEuros === null || input.priceEuros === undefined
        ? null
        : String(input.priceEuros),
      productUrl: input.productUrl ?? null,
      images: input.images,
      sizeKind: input.sizeKind,
      // Une liste vide signifie « toutes les tailles du barème » : le serveur
      // la résout à la lecture, l'administration n'a pas à les énumérer.
      sizes: input.sizes,
      available: input.available,
      stock: input.stock ?? null,
    });

    const shopItemId = Number(inserted[0].insertId);
    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "shop.item.create",
      entityType: "shopItem",
      entityId: shopItemId,
      after: { name: input.name, priceUno: input.priceUno },
    });
    return shopItemId;
  });
}

export async function updateShopItem(
  actor: { userId: number },
  shopItemId: number,
  input: ShopItemInput,
): Promise<void> {
  for (const url of input.images) assertValidImageUrl(url);
  if (input.productUrl) assertValidImageUrl(input.productUrl);

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(shopItems)
      .where(eq(shopItems.id, shopItemId))
      .limit(1);

    if (!current) throw new AppError("NOT_FOUND", "Produit introuvable.");

    await tx
      .update(shopItems)
      .set({
        name: input.name,
        description: input.description,
        category: input.category,
        priceUno: input.priceUno,
        priceEuros:
          input.priceEuros === null || input.priceEuros === undefined
            ? null
            : String(input.priceEuros),
        productUrl: input.productUrl ?? null,
        images: input.images,
        sizeKind: input.sizeKind,
        sizes: input.sizes,
        available: input.available,
        stock: input.stock ?? null,
        updatedAt: new Date(),
      })
      .where(eq(shopItems.id, shopItemId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "shop.item.update",
      entityType: "shopItem",
      entityId: shopItemId,
      before: { name: current.name, priceUno: current.priceUno, available: current.available },
      after: { name: input.name, priceUno: input.priceUno, available: input.available },
    });
  });
}

/**
 * Suppression d'un produit (ADMIN-004).
 * Un produit déjà commandé n'est jamais supprimé physiquement : il est
 * archivé, pour que l'historique des commandes reste lisible.
 */
export async function removeShopItem(
  actor: { userId: number },
  shopItemId: number,
): Promise<{ archived: boolean }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(shopItems)
      .where(eq(shopItems.id, shopItemId))
      .limit(1);

    if (!current) throw new AppError("NOT_FOUND", "Produit introuvable.");

    const ordered = await isProductOrdered(tx, shopItemId);

    if (ordered) {
      await tx
        .update(shopItems)
        .set({ archived: true, available: false, updatedAt: new Date() })
        .where(eq(shopItems.id, shopItemId));
    } else {
      await tx.delete(shopItems).where(eq(shopItems.id, shopItemId));
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "shop.item.archive",
      entityType: "shopItem",
      entityId: shopItemId,
      before: { name: current.name, available: current.available },
      after: { archived: ordered, deleted: !ordered },
    });

    return { archived: ordered };
  });
}

/** Journal d'audit consultable (ADMIN-005). */
export async function listAuditLogs(
  executor: Executor,
  params: { limit: number; cursor?: number | null },
) {
  const rows = await executor
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      beforeJson: auditLogs.beforeJson,
      afterJson: auditLogs.afterJson,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(params.cursor ? sql`${auditLogs.id} < ${params.cursor}` : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  return {
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}
