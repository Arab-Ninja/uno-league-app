import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { deviceTokens, players, users } from "../db/schema.js";
import { env } from "../env.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Notifications push web (ANN-004).
 *
 * Un navigateur qui s'abonne remet trois valeurs : une URL propre à lui
 * (`endpoint`) et deux clés de chiffrement. Le serveur les conserve et s'en
 * sert pour déposer un message chez le service de push du navigateur —
 * Google, Mozilla ou Apple selon le cas. Aucun compte développeur n'est
 * nécessaire : c'est un standard du web.
 *
 * Trois principes gouvernent ce fichier.
 *
 *  - **Le push ne fait jamais échouer ce qu'il annonce.** Un envoi qui rate
 *    est journalisé, jamais propagé : recevoir sa place, son remboursement ou
 *    sa récompense compte, être prévenu est un plus.
 *  - **Un abonnement mort est supprimé.** Le service de push répond 404 ou 410
 *    quand le navigateur a désinstallé l'application ou révoqué la
 *    permission ; garder ces lignes ferait grossir la table indéfiniment et
 *    ralentirait chaque envoi.
 *  - **Le push complète la notification interne, il ne la remplace pas.** Un
 *    joueur sans abonnement — ou qui a tout refusé — retrouve tout dans
 *    l'application.
 *
 * Sur iPhone, Apple n'autorise le push web que pour une application ajoutée à
 * l'écran d'accueil (iOS 16.4+). C'est une contrainte d'Apple, pas un défaut
 * de configuration : l'interface l'explique au moment de proposer l'abonnement.
 */

let configured: boolean | null = null;

/** Vrai si les clés VAPID sont présentes et la bibliothèque initialisée. */
export function pushEnabled(): boolean {
  if (configured !== null) return configured;

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.info("clés VAPID absentes : notifications push désactivées");
    configured = false;
    return configured;
  }

  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return configured;
}

/** Clé publique remise au navigateur pour qu'il puisse s'abonner. */
export function publicKey(): string | null {
  return pushEnabled() ? (env.VAPID_PUBLIC_KEY ?? null) : null;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  platform?: "ios" | "android" | "web";
}

/**
 * Enregistre l'abonnement d'un navigateur.
 *
 * L'`endpoint` est unique en base : un même navigateur qui se réabonne met à
 * jour sa ligne au lieu d'en créer une seconde. Le cas se produit à chaque
 * renouvellement de clés côté navigateur.
 */
export async function subscribe(
  playerId: number,
  input: PushSubscriptionInput,
): Promise<{ subscribed: boolean }> {
  // Les deux clés sont stockées ensemble : elles n'ont de sens que par paire,
  // et les séparer en colonnes aurait imposé une migration à chaque évolution
  // du format d'abonnement.
  const token = JSON.stringify({
    endpoint: input.endpoint,
    keys: input.keys,
  });

  try {
    await db.insert(deviceTokens).values({
      playerId,
      platform: input.platform ?? "web",
      pushToken: token,
      enabled: true,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    await db
      .update(deviceTokens)
      .set({ playerId, enabled: true, lastSeenAt: new Date() })
      .where(eq(deviceTokens.pushToken, token));
  }

  return { subscribed: true };
}

export async function unsubscribe(
  playerId: number,
  endpoint: string,
): Promise<{ removed: number }> {
  const rows = await db
    .select({ id: deviceTokens.id, pushToken: deviceTokens.pushToken })
    .from(deviceTokens)
    .where(eq(deviceTokens.playerId, playerId));

  const stale = rows
    .filter((row) => {
      try {
        return (JSON.parse(row.pushToken) as { endpoint?: string }).endpoint === endpoint;
      } catch {
        return false;
      }
    })
    .map((row) => row.id);

  if (stale.length === 0) return { removed: 0 };

  await db.delete(deviceTokens).where(inArray(deviceTokens.id, stale));
  return { removed: stale.length };
}

/** Nombre d'appareils abonnés pour ce joueur : l'interface s'en sert. */
export async function subscriptionCount(playerId: number): Promise<number> {
  const rows = await db
    .select({ id: deviceTokens.id })
    .from(deviceTokens)
    .where(and(eq(deviceTokens.playerId, playerId), eq(deviceTokens.enabled, true)));

  return rows.length;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Chemin ouvert au clic, ex. "/sessions/12". */
  url?: string;
  /**
   * Regroupe les notifications d'un même sujet : une seconde notification de
   * même étiquette remplace la première au lieu de s'empiler.
   */
  tag?: string;
}

/**
 * Envoie une notification aux appareils d'un joueur.
 *
 * Ne lève jamais. Le résultat dit combien d'appareils ont été atteints, pour
 * les tests et le diagnostic ; les appelants métier l'ignorent.
 */
export async function pushToPlayer(
  playerId: number,
  message: PushMessage,
): Promise<{ sent: number; removed: number }> {
  if (!pushEnabled()) return { sent: 0, removed: 0 };

  const [player] = await db
    .select({ pushEnabled: players.pushEnabled })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  // Le joueur a coupé les notifications : on n'insiste pas.
  if (!player || !player.pushEnabled) return { sent: 0, removed: 0 };

  const rows = await db
    .select()
    .from(deviceTokens)
    .where(and(eq(deviceTokens.playerId, playerId), eq(deviceTokens.enabled, true)));

  const payload = JSON.stringify(message);
  const dead: number[] = [];
  let sent = 0;

  for (const row of rows) {
    let subscription: webpush.PushSubscription;
    try {
      subscription = JSON.parse(row.pushToken) as webpush.PushSubscription;
    } catch {
      dead.push(row.id);
      continue;
    }

    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      // 404/410 : le navigateur a révoqué l'abonnement. C'est définitif, la
      // ligne est retirée. Toute autre panne est passagère : on la journalise
      // sans détruire l'abonnement.
      if (status === 404 || status === 410) {
        dead.push(row.id);
      } else {
        logger.warn({ status, playerId }, "envoi push en échec");
      }
    }
  }

  if (dead.length > 0) {
    await db.delete(deviceTokens).where(inArray(deviceTokens.id, dead));
  }

  return { sent, removed: dead.length };
}

/**
 * Envoie à tous les administrateurs.
 * Utilisé pour les évènements d'exploitation, qui ne visent personne en
 * particulier mais doivent atteindre quelqu'un.
 */
export async function pushToAdmins(
  executor: Executor,
  message: PushMessage,
): Promise<{ sent: number }> {
  if (!pushEnabled()) return { sent: 0 };

  const admins = await executor
    .select({ playerId: players.id })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(eq(users.role, "admin"));

  let sent = 0;
  for (const admin of admins) {
    const result = await pushToPlayer(admin.playerId, message);
    sent += result.sent;
  }
  return { sent };
}
