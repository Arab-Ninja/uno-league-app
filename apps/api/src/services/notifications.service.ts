import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { notificationDeliveries, players, users } from "../db/schema.js";
import { absoluteUrl } from "../email/links.js";
import { mailEnabled, sendMail } from "../email/mailer.js";
import { eventMail } from "../email/templates.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { pushToPlayer } from "./push.service.js";

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
  /** Chemin ouvert au clic sur la notification push, ex. "/sessions/12". */
  url?: string;
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
    // Déjà notifié : c'est le résultat attendu d'un traitement rejoué. On
    // s'arrête là, sans renvoyer de push — sinon une tâche d'entretien qui
    // repasse toutes les heures sonnerait le téléphone à chaque passage.
    if (isDuplicateKeyError(error)) return;

    // Notifier est accessoire ; l'opération observée ne doit pas échouer.
    logger.error(
      { err: error, eventKey: input.eventKey },
      "notification joueur non enregistrée",
    );
    return;
  }

  /*
   * Le push double la notification interne, il ne la remplace pas : un joueur
   * sans abonnement retrouve tout dans l'application. L'envoi est détaché de
   * la transaction en cours — le réseau n'a rien à faire sous un verrou — et
   * ne peut pas faire échouer l'opération observée.
   *
   * Le courrier vient **après**, et seulement si le push n'a atteint aucun
   * appareil. C'est la règle qui évite le double message : un joueur qui a
   * accepté les notifications et dont le téléphone a reçu la sienne n'a rien
   * à lire deux fois. Ceux qu'on ne peut pas joindre autrement — notifications
   * refusées, application désinstallée, jeton périmé — reçoivent un courrier,
   * qui reste le seul canal attaché au compte plutôt qu'à un appareil.
   */
  void pushToPlayer(input.playerId, {
    title: input.title,
    body: input.body,
    ...(input.url ? { url: input.url } : {}),
    tag: input.eventKey,
  })
    .then(async ({ sent }) => {
      if (sent > 0) return;
      await emailFallback(input);
    })
    .catch((error: unknown) => {
      logger.warn({ err: error, playerId: input.playerId }, "push non envoyé");
    });
}

/**
 * Le courrier de repli d'une notification que le push n'a pas portée.
 *
 * Isolé de `notifyPlayer` pour une raison de lecture : la fonction principale
 * décrit *quand* un joueur est prévenu, celle-ci *comment* on le joint quand
 * le téléphone ne répond pas. Elle ne lève jamais — être prévenu reste un
 * supplément.
 */
async function emailFallback(input: PlayerNotification): Promise<void> {
  if (!mailEnabled()) return;

  try {
    const [destinataire] = await db
      .select({ email: users.email, displayName: players.displayName })
      .from(players)
      .innerJoin(users, eq(users.id, players.userId))
      .where(eq(players.id, input.playerId))
      .limit(1);

    if (!destinataire) return;

    await sendMail(
      eventMail({
        to: destinataire.email,
        displayName: destinataire.displayName,
        title: input.title,
        body: input.body,
        // Une adresse relative ne mène nulle part depuis une boîte de
        // réception : le lien doit porter le domaine public.
        url: input.url ? absoluteUrl(input.url) : undefined,
      }),
    );
  } catch (error) {
    logger.warn(
      { err: error, playerId: input.playerId },
      "courrier de repli non envoyé",
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
