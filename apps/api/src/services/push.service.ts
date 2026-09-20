import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { deviceTokens, players, users } from "../db/schema.js";
import { env } from "../env.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { fcmEnabled, sendToDevice } from "../push/fcm.js";

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
export function webPushEnabled(): boolean {
  if (configured !== null) return configured;

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.info("clés VAPID absentes : push navigateur désactivé");
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

/**
 * Vrai si **une** route est ouverte (ANN-005).
 *
 * Les deux transports sont indépendants : une ligue peut n'avoir que des
 * navigateurs — VAPID seul —, ou n'exister qu'en application mobile — Firebase
 * seul. Exiger les deux fermerait le push à qui n'a besoin que d'un.
 */
export function pushEnabled(): boolean {
  return webPushEnabled() || fcmEnabled();
}

/**
 * Clé publique remise au navigateur pour qu'il puisse s'abonner.
 *
 * Nulle quand seul Firebase est configuré : l'écran comprend alors qu'il n'y
 * a rien à proposer côté navigateur, et n'affiche pas un bouton sans effet.
 */
export function publicKey(): string | null {
  return webPushEnabled() ? (env.VAPID_PUBLIC_KEY ?? null) : null;
}

/**
 * Ce qu'un appareil remet pour être joignable.
 *
 * Deux formes, parce que deux mondes : un navigateur rend une URL d'endpoint
 * et deux clés de chiffrement, une application empaquetée rend un jeton
 * Firebase opaque. Une union discriminée plutôt qu'un objet aux champs
 * facultatifs — ainsi le compilateur refuse un abonnement à moitié rempli,
 * qui se serait sinon traduit par un appareil silencieux.
 */
export type PushSubscriptionInput =
  | {
      transport?: "webpush";
      endpoint: string;
      keys: { p256dh: string; auth: string };
      platform?: "ios" | "android" | "web";
    }
  | {
      transport: "fcm";
      token: string;
      platform?: "ios" | "android" | "web";
    };

/**
 * Enregistre un appareil.
 *
 * Le jeton est unique en base : un même appareil qui se réabonne met à jour sa
 * ligne au lieu d'en créer une seconde. Le cas est courant — un navigateur
 * renouvelle ses clés, Android renouvelle son jeton après une mise à jour du
 * système.
 */
export async function subscribe(
  playerId: number,
  input: PushSubscriptionInput,
): Promise<{ subscribed: boolean }> {
  const fcm = input.transport === "fcm";

  /*
   * Pour un abonnement web, les deux clés sont stockées avec l'endpoint dans
   * une seule colonne : elles n'ont de sens que par paire, et les séparer
   * aurait imposé une migration à chaque évolution du format. Pour Firebase,
   * le jeton est déjà une chaîne : il y entre tel quel.
   */
  const token = fcm
    ? input.token
    : JSON.stringify({ endpoint: input.endpoint, keys: input.keys });

  try {
    await db.insert(deviceTokens).values({
      playerId,
      platform: input.platform ?? "web",
      transport: fcm ? "fcm" : "webpush",
      pushToken: token,
      enabled: true,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    await db
      .update(deviceTokens)
      .set({
        playerId,
        // Le même appareil peut changer de route — une PWA désinstallée puis
        // réinstallée depuis le store, par exemple. La ligne suit.
        transport: fcm ? "fcm" : "webpush",
        platform: input.platform ?? "web",
        enabled: true,
        lastSeenAt: new Date(),
      })
      .where(eq(deviceTokens.pushToken, token));
  }

  return { subscribed: true };
}

/**
 * Retire un appareil.
 *
 * `handle` est ce que l'appareil sait dire de lui-même : son endpoint pour un
 * navigateur, son jeton pour une application. Les deux sont acceptés sans que
 * l'appelant ait à préciser lequel — il ne connaît souvent que le sien.
 */
export async function unsubscribe(
  playerId: number,
  handle: string,
): Promise<{ removed: number }> {
  const rows = await db
    .select({ id: deviceTokens.id, pushToken: deviceTokens.pushToken })
    .from(deviceTokens)
    .where(eq(deviceTokens.playerId, playerId));

  const stale = rows
    .filter((row) => {
      if (row.pushToken === handle) return true;
      try {
        return (
          (JSON.parse(row.pushToken) as { endpoint?: string }).endpoint ===
          handle
        );
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
    .where(
      and(eq(deviceTokens.playerId, playerId), eq(deviceTokens.enabled, true)),
    );

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
    .where(
      and(eq(deviceTokens.playerId, playerId), eq(deviceTokens.enabled, true)),
    );

  const payload = JSON.stringify(message);
  const dead: number[] = [];
  let sent = 0;

  for (const row of rows) {
    /*
     * Chaque appareil part par sa route, et la colonne le dit. La deviner
     * d'après le contenu du jeton aurait marché — un JSON d'un côté, une
     * chaîne opaque de l'autre — mais aurait fait dépendre l'acheminement
     * d'un format, c'est-à-dire du jour où Google changera le sien.
     */
    if (row.transport === "fcm") {
      if (!fcmEnabled()) continue;

      const outcome = await sendToDevice(row.pushToken, message);
      if (outcome === "sent") sent++;
      // Application désinstallée ou jeton renouvelé : la ligne ne mène plus
      // nulle part. Une panne passagère, elle, a déjà été journalisée.
      else if (outcome === "unregistered") dead.push(row.id);
      continue;
    }

    if (!webPushEnabled()) continue;

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
