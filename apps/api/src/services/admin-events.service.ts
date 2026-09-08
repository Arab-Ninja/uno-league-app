import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  ADMIN_EVENT_LABELS,
  adminEventCategory,
  type AdminEventCategory,
  type AdminEventType,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { adminEvents, players } from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { pushToAdmins } from "./push.service.js";

/**
 * Flux d'évènements de l'administration (ADMIN-006).
 *
 * Chaque fait marquant du domaine y dépose une ligne : réservation complète,
 * session confirmée ou clôturée, paiement reçu ou en retard, remplaçant
 * intégré, commande, transfert, avis produit. Le tableau de bord lit ce flux
 * tel quel.
 *
 * Trois propriétés le rendent utilisable :
 *
 *  - **il ne fait jamais échouer l'opération qu'il observe.** Notifier est
 *    accessoire ; débiter, réserver ou livrer ne l'est pas. Une écriture qui
 *    échoue est journalisée côté serveur et l'appelant continue ;
 *  - **il ne double jamais.** `eventKey` est unique en base : un webhook
 *    rejoué ou un retry réseau ne produit pas deux notifications ;
 *  - **il est distinct du journal d'audit.** L'audit répond à « qui a fait
 *    quoi », pour la responsabilité ; ce flux répond à « qu'est-il arrivé »,
 *    pour l'exploitation. Les deux ont des durées de vie et des lecteurs
 *    différents.
 */

export interface AdminEventInput {
  type: AdminEventType;
  title?: string;
  body: string;
  entityType?: string;
  entityId?: number | null;
  playerId?: number | null;
  /**
   * Clé de déduplication. Deux évènements de même clé ne produisent qu'une
   * ligne — indispensable pour les traitements rejouables (paiements,
   * webhooks, tâches périodiques).
   */
  key: string;
}

/**
 * Enregistre un évènement.
 *
 * **`executor` est obligatoire, et ce n'est pas une formalité.** La table
 * porte une clé étrangère vers `players` : écrire l'évènement sur une autre
 * connexion pendant qu'une transaction détient un verrou exclusif sur la
 * ligne du joueur concerné bloque la vérification de cette clé jusqu'au
 * timeout — cinquante secondes d'attente pour une notification, puis un
 * échec. Le défaut implicite rendait cette faute invisible : le paramètre est
 * donc explicite, pour que chaque appelant tranche.
 *
 * La règle est simple : **à l'intérieur d'une transaction, passer `tx`** ;
 * après son commit, passer `db`.
 */
export async function recordAdminEvent(
  input: AdminEventInput,
  executor: Executor,
): Promise<void> {
  try {
    await executor.insert(adminEvents).values({
      type: input.type,
      category: adminEventCategory(input.type),
      title: input.title ?? ADMIN_EVENT_LABELS[input.type],
      body: input.body.slice(0, 300),
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      playerId: input.playerId ?? null,
      eventKey: input.key.slice(0, 120),
    });
  } catch (error) {
    // Déjà notifié : c'est le comportement attendu d'un traitement rejoué.
    if (isDuplicateKeyError(error)) return;

    // Toute autre panne reste silencieuse pour l'appelant : une session ne
    // doit pas échouer parce que le flux d'administration est indisponible.
    logger.error(
      { err: error, type: input.type, key: input.key },
      "évènement d'administration non enregistré",
    );
    return;
  }

  // L'administration reçoit aussi le push : c'est la demande — être averti de
  // chaque évènement sans avoir à ouvrir l'application. L'envoi est détaché,
  // hors transaction, et ne peut pas faire échouer l'opération observée.
  void pushToAdmins(db, {
    title: input.title ?? ADMIN_EVENT_LABELS[input.type],
    body: input.body,
    url: "/admin",
    tag: input.key,
  }).catch((error: unknown) => {
    logger.warn({ err: error, type: input.type }, "push administration non envoyé");
  });
}

export interface AdminEventView {
  id: number;
  type: string;
  category: AdminEventCategory;
  title: string;
  body: string;
  entityType: string | null;
  entityId: number | null;
  playerName: string | null;
  read: boolean;
  createdAt: string;
}

export async function listAdminEvents(params: {
  category?: AdminEventCategory;
  unreadOnly?: boolean;
  limit: number;
}): Promise<AdminEventView[]> {
  const conditions = [];
  if (params.category) conditions.push(eq(adminEvents.category, params.category));
  if (params.unreadOnly) conditions.push(isNull(adminEvents.readAt));

  const rows = await db
    .select({
      event: adminEvents,
      playerName: players.displayName,
    })
    .from(adminEvents)
    .leftJoin(players, eq(players.id, adminEvents.playerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminEvents.createdAt), desc(adminEvents.id))
    .limit(params.limit);

  return rows.map((row) => ({
    id: row.event.id,
    type: row.event.type,
    category: row.event.category,
    title: row.event.title,
    body: row.event.body,
    entityType: row.event.entityType,
    entityId: row.event.entityId,
    playerName: row.playerName,
    read: row.event.readAt !== null,
    createdAt: row.event.createdAt.toISOString(),
  }));
}

/** Compteurs du tableau de bord : total non lu, et détail par famille. */
export async function adminEventCounts(): Promise<{
  unread: number;
  byCategory: Record<AdminEventCategory, number>;
}> {
  const rows = await db
    .select({
      category: adminEvents.category,
      total: sql<number>`COUNT(*)`,
    })
    .from(adminEvents)
    .where(isNull(adminEvents.readAt))
    .groupBy(adminEvents.category);

  const byCategory: Record<AdminEventCategory, number> = {
    calendar: 0,
    payment: 0,
    shop: 0,
    wallet: 0,
  };

  let unread = 0;
  for (const row of rows) {
    const total = Number(row.total);
    byCategory[row.category] = total;
    unread += total;
  }

  return { unread, byCategory };
}

/**
 * Marque comme lus les évènements jusqu'à `throughId` inclus.
 *
 * Borner par identifiant plutôt que « tout marquer » évite de faire
 * disparaître un évènement arrivé pendant que l'administrateur lisait la
 * liste : il ne peut acquitter que ce qu'il a effectivement vu.
 */
export async function markAdminEventsRead(throughId: number): Promise<{
  marked: number;
}> {
  const result = await db
    .update(adminEvents)
    .set({ readAt: new Date() })
    .where(and(isNull(adminEvents.readAt), lt(adminEvents.id, throughId + 1)));

  return { marked: Number(result[0].affectedRows ?? 0) };
}
