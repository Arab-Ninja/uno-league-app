import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_LOCALE,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_RULES,
  gabarit,
  isLocale,
  isQuietHour,
  resolveNotificationSettings,
  type ErrorTemplate,
  type Locale,
  type NotificationCategory,
  type NotificationSettingsView,
  type NotificationView,
  type PushPromptStage,
  type StoredNotificationSettings,
  type UpdateNotificationSettingsInput,
} from "@uno/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { notificationDeliveries, players, users } from "../db/schema.js";
import { env } from "../env.js";
import { absoluteUrl } from "../email/links.js";
import { mailEnabled, sendMail } from "../email/mailer.js";
import { eventMail } from "../email/templates.js";
import { traduireModele } from "../i18n/index.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { pushToPlayer, subscriptionCount } from "./push.service.js";

/**
 * Notifications adressées à un joueur (ANN-004, NOTIF-001).
 *
 * Le canal `inapp` est le seul garanti : il n'a besoin ni d'un jeton
 * d'appareil, ni de l'accord d'un service tiers. Chaque notification y est
 * enregistrée, quelle que soit sa catégorie — c'est l'onglet « Pour moi », et
 * c'est elle qui permet à un joueur de retrouver un rappel qu'il a manqué.
 *
 * Le push et l'e-mail viennent ensuite, selon les réglages du joueur pour la
 * catégorie (NOTIF-001) et les heures calmes (NOTIF-004).
 *
 * L'unicité (joueur, évènement, canal) rend l'écriture rejouable : une tâche
 * d'entretien qui repasse toutes les heures ne renotifie pas le même retard.
 */

/**
 * Le texte d'une notification (I18N-002).
 *
 * Un gabarit se traduit dans la langue **du destinataire**, celle de son
 * compte : la notification part souvent d'une tâche d'entretien ou du geste
 * d'un autre joueur, et la langue de la requête n'est alors pas la sienne.
 * Plusieurs gabarits se suivent, séparés d'une espace ; une chaîne passe
 * telle quelle — le mot qu'un administrateur a lui-même écrit, par exemple.
 */
export type NotificationText =
  string | ErrorTemplate | readonly (string | ErrorTemplate)[];

function rendre(texte: NotificationText, locale: Locale): string {
  const morceaux = Array.isArray(texte) ? texte : [texte];
  return morceaux
    .map((morceau: string | ErrorTemplate) =>
      typeof morceau === "string" ? morceau : traduireModele(locale, morceau),
    )
    .join(" ")
    .trim();
}

export interface PlayerNotification {
  playerId: number;
  eventKey: string;
  /**
   * Ce dont il s'agit (NOTIF-001) : c'est la catégorie qui décide, selon les
   * réglages du joueur, si la notification part aussi en push et en e-mail.
   */
  category: NotificationCategory;
  title: NotificationText;
  body: NotificationText;
  /** Chemin ouvert au clic sur la notification, ex. "/sessions/12". */
  url?: string;
  /**
   * Courrier de repli quand aucun appareil n'a reçu le push (défaut : oui).
   *
   * Une annonce adressée à toute la ligue passe à `false` : la renvoyer par
   * courrier à chaque joueur sans notifications ferait un envoi de masse à
   * chaque publication. Elle reste lisible dans l'application.
   */
  emailFallback?: boolean;
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
  now = new Date(),
): Promise<void> {
  let rendu: RenderedNotification;
  let canaux: { push: boolean; deferred: boolean; email: boolean };
  try {
    // Lu sur la même connexion : la ligne du joueur peut être verrouillée par
    // la transaction en cours.
    const [destinataire] = await executor
      .select({
        locale: players.locale,
        settings: players.notificationSettings,
        emailOptOutAt: players.emailOptOutAt,
      })
      .from(players)
      .where(eq(players.id, input.playerId))
      .limit(1);
    const langue = destinataire?.locale;
    const locale = isLocale(langue) ? langue : DEFAULT_LOCALE;
    rendu = {
      ...input,
      locale,
      title: rendre(input.title, locale),
      body: rendre(input.body, locale),
    };

    const reglages = resolveNotificationSettings(destinataire?.settings);
    const pushVoulu = reglages.push[input.category];
    // Les heures calmes retiennent le push ; le récapitulatif du matin le
    // reprend (NOTIF-004).
    const retenu = pushVoulu && reglages.quietHours && isQuietHour(now);
    canaux = {
      push: pushVoulu && !retenu,
      deferred: retenu,
      email:
        input.emailFallback !== false &&
        reglages.email[input.category] &&
        !destinataire?.emailOptOutAt,
    };

    await executor.insert(notificationDeliveries).values({
      playerId: input.playerId,
      eventKey: input.eventKey.slice(0, 120),
      channel: "inapp",
      title: rendu.title.slice(0, 120),
      body: rendu.body.slice(0, 300),
      category: input.category,
      url: input.url ? input.url.slice(0, 200) : null,
      pushDeferredAt: retenu ? now : null,
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
  void deliver(rendu, canaux).catch((error: unknown) => {
    logger.warn({ err: error, playerId: input.playerId }, "push non envoyé");
  });
}

async function deliver(
  rendu: RenderedNotification,
  canaux: { push: boolean; deferred: boolean; email: boolean },
): Promise<void> {
  if (canaux.push) {
    const { sent } = await pushToPlayer(rendu.playerId, {
      title: rendu.title,
      body: rendu.body,
      ...(rendu.url ? { url: rendu.url } : {}),
      tag: rendu.eventKey,
    });
    if (sent > 0) return;
  }
  if (!canaux.email) return;

  // Retenu pour la nuit chez un joueur qui a un appareil : le récapitulatif
  // du matin le préviendra. Un courrier de minuit n'apprendrait rien de plus.
  if (canaux.deferred && (await subscriptionCount(rendu.playerId)) > 0) {
    return;
  }
  await emailFallback(rendu);
}

/**
 * Le courrier de repli d'une notification que le push n'a pas portée.
 *
 * Isolé de `notifyPlayer` pour une raison de lecture : la fonction principale
 * décrit *quand* un joueur est prévenu, celle-ci *comment* on le joint quand
 * le téléphone ne répond pas. Elle ne lève jamais — être prévenu reste un
 * supplément.
 */
interface RenderedNotification {
  playerId: number;
  eventKey: string;
  title: string;
  body: string;
  url?: string;
  locale: Locale;
}

async function emailFallback(input: RenderedNotification): Promise<void> {
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
        locale: input.locale,
        unsubscribe: unsubscribeLinks(input.playerId),
      }),
    );
  } catch (error) {
    logger.warn(
      { err: error, playerId: input.playerId },
      "courrier de repli non envoyé",
    );
  }
}

// ---------------------------------------------------------------------------
// Désinscription des e-mails (NOTIF-002)
// ---------------------------------------------------------------------------

/**
 * Le jeton du lien de désinscription : l'identifiant du joueur et sa
 * signature.
 *
 * Signé plutôt que tiré au hasard et stocké : il n'y a rien à conserver, et
 * le lien d'un vieux courrier fonctionne toujours. La signature empêche d'en
 * fabriquer un pour un autre joueur — sans elle, n'importe qui pourrait
 * désinscrire toute la ligue en comptant de 1 à N. Il ne donne aucun autre
 * droit que celui de couper, ou de rétablir, les e-mails de ce compte.
 */
function signature(playerId: number): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`email-unsubscribe:${playerId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function emailUnsubscribeToken(playerId: number): string {
  return `${playerId}.${signature(playerId)}`;
}

export function playerFromUnsubscribeToken(token: string): number | null {
  const [id, sig] = token.split(".");
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0 || !sig) return null;
  const attendue = Buffer.from(signature(playerId));
  const recue = Buffer.from(sig);
  if (attendue.length !== recue.length) return null;
  return timingSafeEqual(attendue, recue) ? playerId : null;
}

/** Les deux adresses d'un courrier : la page, et le désabonnement en un clic. */
export function unsubscribeLinks(
  playerId: number,
): { page: string; oneClick: string } | undefined {
  const jeton = encodeURIComponent(emailUnsubscribeToken(playerId));
  const page = absoluteUrl(`/desinscription?jeton=${jeton}`);
  const oneClick = absoluteUrl(`/trpc/email-unsubscribe?jeton=${jeton}`);
  return page && oneClick ? { page, oneClick } : undefined;
}

/** Coupe ou rétablit les e-mails d'un joueur. */
export async function setEmailOptOut(
  playerId: number,
  optOut: boolean,
): Promise<void> {
  await db
    .update(players)
    .set({ emailOptOutAt: optOut ? new Date() : null })
    .where(eq(players.id, playerId));
}

// ---------------------------------------------------------------------------
// Réglages (NOTIF-001)
// ---------------------------------------------------------------------------

export async function getNotificationSettings(
  playerId: number,
): Promise<NotificationSettingsView> {
  const [row] = await db
    .select({
      settings: players.notificationSettings,
      emailOptOutAt: players.emailOptOutAt,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  return {
    settings: resolveNotificationSettings(row?.settings),
    emailOptOut: Boolean(row?.emailOptOutAt),
  };
}

/**
 * Enregistre ce que le joueur change. Une catégorie verrouillée, ou un
 * e-mail que la catégorie n'envoie jamais, est ignoré : l'écran ne les
 * propose pas, et une requête forgée n'y change rien.
 */
export async function updateNotificationSettings(
  playerId: number,
  input: UpdateNotificationSettingsInput,
): Promise<NotificationSettingsView> {
  const [row] = await db
    .select({ settings: players.notificationSettings })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const stored: StoredNotificationSettings = {
    push: { ...(row?.settings?.push ?? {}) },
    email: { ...(row?.settings?.email ?? {}) },
    ...(row?.settings?.quietHours !== undefined
      ? { quietHours: row.settings.quietHours }
      : {}),
    ...(row?.settings?.reminderHours !== undefined
      ? { reminderHours: row.settings.reminderHours }
      : {}),
  };

  for (const category of NOTIFICATION_CATEGORIES) {
    const rule = NOTIFICATION_RULES[category];
    if (rule.locked) continue;
    const push = input.push?.[category];
    if (push !== undefined) stored.push![category] = push;
    const email = input.email?.[category];
    if (email !== undefined && rule.email !== null) {
      stored.email![category] = email;
    }
  }
  if (input.quietHours !== undefined) stored.quietHours = input.quietHours;
  if (input.reminderHours !== undefined) {
    stored.reminderHours = input.reminderHours;
  }

  await db
    .update(players)
    .set({
      notificationSettings: stored,
      ...(input.emails !== undefined
        ? { emailOptOutAt: input.emails ? null : new Date() }
        : {}),
    })
    .where(eq(players.id, playerId));

  return getNotificationSettings(playerId);
}

// ---------------------------------------------------------------------------
// Proposer le push (NOTIF-003)
// ---------------------------------------------------------------------------

/**
 * La proposition d'activer le push à montrer : la première fois — à
 * l'inscription, ou au premier lancement pour un compte existant —, puis une
 * relance unique à la première séance rejointe. L'écran ne la montre que si
 * l'appareil peut recevoir le push et qu'aucun appareil du compte n'est
 * abonné.
 */
export async function pushPromptStage(
  playerId: number,
): Promise<PushPromptStage | null> {
  const [row] = await db
    .select({
      prompted: players.pushPromptedAt,
      reminded: players.pushRemindedAt,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!row) return null;
  if (!row.prompted) return "first";
  if (!row.reminded) return "afterJoin";
  return null;
}

export async function markPushPrompt(
  playerId: number,
  stage: PushPromptStage,
): Promise<void> {
  const now = new Date();
  await db
    .update(players)
    .set(
      stage === "first"
        ? { pushPromptedAt: now }
        : { pushPromptedAt: now, pushRemindedAt: now },
    )
    .where(
      and(
        eq(players.id, playerId),
        stage === "first"
          ? isNull(players.pushPromptedAt)
          : isNull(players.pushRemindedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Récapitulatif du matin (NOTIF-004)
// ---------------------------------------------------------------------------

/**
 * À la fin des heures calmes, un push par joueur pour ce qui est arrivé
 * pendant la nuit : la notification elle-même s'il n'y en a qu'une, un
 * décompte sinon. Ce qui a déjà été lu dans l'application ne sonne plus.
 */
export async function sendMorningDigests(now = new Date()): Promise<number> {
  if (isQuietHour(now)) return 0;

  const rows = await db
    .select({
      id: notificationDeliveries.id,
      playerId: notificationDeliveries.playerId,
      title: notificationDeliveries.title,
      body: notificationDeliveries.body,
      url: notificationDeliveries.url,
      readAt: notificationDeliveries.readAt,
      locale: players.locale,
    })
    .from(notificationDeliveries)
    .innerJoin(players, eq(players.id, notificationDeliveries.playerId))
    .where(isNotNull(notificationDeliveries.pushDeferredAt))
    .orderBy(desc(notificationDeliveries.id));
  if (rows.length === 0) return 0;

  // Remis à zéro d'abord : une passe concurrente ne renverra pas le même.
  await db
    .update(notificationDeliveries)
    .set({ pushDeferredAt: null })
    .where(
      inArray(
        notificationDeliveries.id,
        rows.map((row) => row.id),
      ),
    );

  const parJoueur = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.readAt) continue;
    parJoueur.set(row.playerId, [...(parJoueur.get(row.playerId) ?? []), row]);
  }

  let sent = 0;
  for (const [playerId, items] of parJoueur) {
    const locale = isLocale(items[0]!.locale)
      ? items[0]!.locale
      : DEFAULT_LOCALE;
    const message =
      items.length === 1
        ? {
            title: items[0]!.title,
            body: items[0]!.body,
            ...(items[0]!.url ? { url: items[0]!.url } : {}),
          }
        : {
            title: traduireModele(locale, gabarit("Pendant la nuit")),
            body: traduireModele(
              locale,
              gabarit("{nombre} nouvelles notifications vous attendent.", {
                nombre: items.length,
              }),
            ),
            url: "/notifications",
          };
    try {
      const result = await pushToPlayer(playerId, {
        ...message,
        tag: "recapitulatif",
      });
      if (result.sent > 0) sent++;
    } catch (error) {
      logger.warn({ err: error, playerId }, "récapitulatif non envoyé");
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// L'onglet « Pour moi »
// ---------------------------------------------------------------------------

export async function listNotifications(params: {
  playerId: number;
  limit: number;
}): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.playerId, params.playerId))
    .orderBy(
      desc(notificationDeliveries.createdAt),
      desc(notificationDeliveries.id),
    )
    .limit(params.limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    category: (NOTIFICATION_CATEGORIES as readonly string[]).includes(
      row.category ?? "",
    )
      ? (row.category as NotificationCategory)
      : null,
    url: row.url,
  }));
}

export async function unreadNotificationCount(
  playerId: number,
): Promise<number> {
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
