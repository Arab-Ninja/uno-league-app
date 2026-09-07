import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { notificationDeliveries } from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Notifications adressées à un joueur (ANN-004).
 *
 * Le canal `inapp` est le seul garanti : il n'a besoin ni d'un jeton
 * d'appareil, ni de l'accord d'un service tiers. La notification push, quand
 * elle existera, viendra s'ajouter à cette trace, pas la remplacer — c'est
 * elle qui permet à un joueur de retrouver un rappel qu'il a manqué.
 *
 * L'unicité (joueur, évènement, canal) rend l'écriture rejouable : une tâche
 * d'entretien qui repasse toutes les heures ne renotifie pas le même retard.
 */

export interface PlayerNotification {
  playerId: number;
  eventKey: string;
  title: string;
  body: string;
}

/**
 * `executor` est obligatoire pour la même raison que dans le flux
 * d'administration : la table porte une clé étrangère vers `players`, et
 * écrire sur une autre connexion pendant qu'une transaction verrouille la
 * ligne du joueur bloque jusqu'au timeout. Dans une transaction, passer `tx` ;
 * en dehors, passer `db`.
 */
export async function notifyPlayer(
  input: PlayerNotification,
  executor: Executor,
): Promise<void> {
  try {
    await executor.insert(notificationDeliveries).values({
      playerId: input.playerId,
      eventKey: input.eventKey.slice(0, 120),
      channel: "inapp",
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 300),
    });
  } catch (error) {
    // Déjà notifié : c'est le résultat attendu d'un traitement rejoué.
    if (isDuplicateKeyError(error)) return;

    // Notifier est accessoire ; l'opération observée ne doit pas échouer.
    logger.error(
      { err: error, eventKey: input.eventKey },
      "notification joueur non enregistrée",
    );
  }
}

export interface NotificationView {
  id: number;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(params: {
  playerId: number;
  limit: number;
}): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.playerId, params.playerId))
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(params.limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function unreadNotificationCount(playerId: number): Promise<number> {
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.playerId, playerId),
        isNull(notificationDeliveries.readAt),
      ),
    );

  return rows.length;
}

/**
 * Marque comme lues les notifications jusqu'à `throughId` inclus : le joueur
 * n'acquitte que ce qu'il a effectivement vu.
 */
export async function markNotificationsRead(params: {
  playerId: number;
  throughId: number;
}): Promise<{ marked: number }> {
  const result = await db
    .update(notificationDeliveries)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationDeliveries.playerId, params.playerId),
        isNull(notificationDeliveries.readAt),
        lt(notificationDeliveries.id, params.throughId + 1),
      ),
    );

  return { marked: Number(result[0].affectedRows ?? 0) };
}
