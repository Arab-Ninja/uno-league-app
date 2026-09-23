import { and, desc, eq, sql } from "drizzle-orm";
import {
  AppError,
  type DecideShopSuggestionInput,
  type ShopSuggestionInput,
  type ShopSuggestionStatus,
  type ShopSuggestionView,
  gabarit,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { players, shopSuggestions } from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { notifyPlayer } from "./notifications.service.js";

/**
 * Produits proposés par les joueurs (SHOP-009).
 *
 * La boutique est un bazar : personne à l'administration ne connaît tous les
 * produits que la ligue aimerait y trouver. Un joueur signale donc un produit
 * — titre, description courte, lien d'achat — et l'administration tranche.
 *
 * Une proposition retenue n'ajoute rien au catalogue toute seule : le produit
 * est créé à la main, avec son prix en UNO, ses images et sa catégorie. Cette
 * table n'est qu'une boîte à idées tracée, dont chaque décision revient à son
 * auteur par notification.
 */

/** Assez pour empêcher qu'une file de propositions serve de messagerie. */
const PENDING_LIMIT_PER_PLAYER = 5;

function toView(
  row: typeof shopSuggestions.$inferSelect,
  player: { id: number; firstName: string; lastName: string } | null,
): ShopSuggestionView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    status: row.status,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    player,
  };
}

export async function suggestProduct(
  actor: { playerId: number; userId: number },
  input: ShopSuggestionInput,
): Promise<ShopSuggestionView> {
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select({ total: sql<number>`COUNT(*)` })
      .from(shopSuggestions)
      .where(
        and(
          eq(shopSuggestions.playerId, actor.playerId),
          eq(shopSuggestions.status, "pending"),
        ),
      );

    if (Number(pending?.total ?? 0) >= PENDING_LIMIT_PER_PLAYER) {
      throw new AppError(
        "CONFLICT",
        gabarit(
          "Vous avez déjà {limite} propositions en attente. Attendez une réponse avant d'en envoyer d'autres.",
          { limite: PENDING_LIMIT_PER_PLAYER },
        ),
      );
    }

    const inserted = await tx.insert(shopSuggestions).values({
      playerId: actor.playerId,
      title: input.title,
      description: input.description,
      url: input.url,
      status: "pending",
    });
    const suggestionId = Number(inserted[0].insertId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "shop.suggestion.create",
      entityType: "shop_suggestion",
      entityId: suggestionId,
      after: { title: input.title },
    });

    await recordAdminEvent(
      {
        type: "shop.suggestion",
        body: `Produit proposé : « ${input.title} ».`,
        entityType: "shop_suggestion",
        entityId: suggestionId,
        playerId: actor.playerId,
        key: `shop:suggestion:${suggestionId}`,
      },
      tx,
    );

    const [row] = await tx
      .select()
      .from(shopSuggestions)
      .where(eq(shopSuggestions.id, suggestionId))
      .limit(1);

    return toView(row!, null);
  });
}

/** Les propositions d'un joueur, la plus récente d'abord. */
export async function listOwnSuggestions(
  executor: Executor,
  playerId: number,
): Promise<ShopSuggestionView[]> {
  const rows = await executor
    .select()
    .from(shopSuggestions)
    .where(eq(shopSuggestions.playerId, playerId))
    .orderBy(desc(shopSuggestions.createdAt))
    .limit(50);

  return rows.map((row) => toView(row, null));
}

/**
 * Vue d'administration. Les propositions en attente d'abord : ce sont les
 * seules sur lesquelles il y a quelque chose à faire.
 */
export async function listSuggestions(params: {
  status?: ShopSuggestionStatus | undefined;
  limit: number;
}): Promise<ShopSuggestionView[]> {
  const rows = await db
    .select({
      suggestion: shopSuggestions,
      playerId: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
    })
    .from(shopSuggestions)
    .innerJoin(players, eq(players.id, shopSuggestions.playerId))
    .where(
      params.status ? eq(shopSuggestions.status, params.status) : undefined,
    )
    .orderBy(desc(shopSuggestions.createdAt))
    .limit(params.limit);

  return rows.map((row) =>
    toView(row.suggestion, {
      id: row.playerId,
      firstName: row.firstName,
      lastName: row.lastName,
    }),
  );
}

/** Nombre de propositions en attente, pour la pastille du tableau de bord. */
export async function countPendingSuggestions(
  executor: Executor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`COUNT(*)` })
    .from(shopSuggestions)
    .where(eq(shopSuggestions.status, "pending"));

  return Number(row?.total ?? 0);
}

/**
 * Décision de l'administration. Retenue ou écartée, l'auteur est prévenu — une
 * proposition sans réponse décourage la suivante.
 */
export async function decideSuggestion(
  actor: { userId: number },
  input: DecideShopSuggestionInput,
): Promise<ShopSuggestionView> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(shopSuggestions)
      .where(eq(shopSuggestions.id, input.suggestionId))
      .limit(1);

    if (!existing) throw new AppError("NOT_FOUND", "Proposition introuvable.");
    if (existing.status !== "pending") {
      throw new AppError("CONFLICT", "Cette proposition a déjà été traitée.");
    }

    const note = input.note?.trim() || null;

    await tx
      .update(shopSuggestions)
      .set({
        status: input.decision,
        decisionNote: note,
        decidedBy: actor.userId,
        decidedAt: new Date(),
      })
      .where(eq(shopSuggestions.id, existing.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "shop.suggestion.decide",
      entityType: "shop_suggestion",
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: input.decision },
    });

    const retained = input.decision === "approved";
    await notifyPlayer(
      {
        playerId: existing.playerId,
        eventKey: `shop:suggestion:${existing.id}:${input.decision}`,
        title: retained ? "Proposition retenue" : "Proposition écartée",
        body: retained
          ? `« ${existing.title} » rejoint la boutique. ${note ?? ""}`.trim()
          : `« ${existing.title} » n'a pas été retenue. ${note ?? ""}`.trim(),
        url: "/boutique",
      },
      tx,
    );

    const [row] = await tx
      .select()
      .from(shopSuggestions)
      .where(eq(shopSuggestions.id, existing.id))
      .limit(1);

    return toView(row!, null);
  });
}
