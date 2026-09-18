import { createHmac, randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { AppError } from "@uno/shared";
import { db } from "../db/client.js";
import { passwordResetTokens, players, users } from "../db/schema.js";
import { absoluteUrl } from "../email/links.js";
import { mailEnabled, sendMail } from "../email/mailer.js";
import { passwordResetMail } from "../email/templates.js";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { hashPassword } from "../lib/password.js";
import { revokeAllSessions } from "./auth.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Réinitialisation de mot de passe (AUTH-009).
 *
 * **Le manque que cela comble.** Le seul changement de mot de passe possible
 * exigeait de connaître l'ancien, et aucune route d'administration n'en posait
 * un nouveau. Un joueur qui oubliait le sien était enfermé dehors
 * définitivement : la seule sortie aurait été une écriture directe en base.
 * Avec quinze joueurs cela se règle à la main ; avec cent, c'est une
 * intervention en production tous les mois.
 *
 * Trois décisions gouvernent ce fichier, et chacune se paie si on l'oublie.
 */

/** 32 octets : la même longueur qu'un jeton de session, et pour la même raison. */
const TOKEN_BYTES = 32;

/**
 * Une heure.
 *
 * Assez pour aller chercher le courrier, finir ce qu'on faisait et revenir.
 * Pas assez pour qu'un lien traîne des jours dans une boîte, où il vaut le
 * compte. Le courrier annonce la durée : un lien périmé sans explication se
 * lit comme une panne.
 */
export const RESET_TTL_MINUTES = 60;

/**
 * Le jeton est haché par HMAC, comme celui d'une session.
 *
 * Un simple SHA-256 suffirait à empêcher de rejouer le contenu de la table,
 * mais pas à empêcher de le **forger** : qui connaîtrait la fonction pourrait
 * calculer le haché d'un jeton de son choix et l'insérer. Le HMAC met le
 * secret serveur dans la boucle, et ce secret n'est pas en base.
 */
function hashResetToken(token: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

/**
 * Demande de réinitialisation.
 *
 * **Le retour ne dit jamais si le compte existe.** C'est la règle qui compte
 * ici : une réponse qui distingue « message envoyé » de « adresse inconnue »
 * transforme ce formulaire en annuaire, où l'on vérifie une à une quelles
 * adresses ont un compte. On répond donc toujours la même chose, et la
 * fonction ne lève pas davantage quand l'adresse est inconnue.
 *
 * Le courrier, lui, n'est envoyé que s'il y a quelqu'un à qui l'envoyer.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const adresse = email.trim().toLowerCase();

  const [compte] = await db
    .select({
      userId: users.id,
      email: users.email,
      status: users.status,
      displayName: players.displayName,
    })
    .from(users)
    .innerJoin(players, eq(players.userId, users.id))
    .where(eq(users.email, adresse))
    .limit(1);

  // Adresse inconnue, ou compte suspendu, supprimé, anonymisé : rien ne part,
  // et l'appelant n'apprend rien de cette différence.
  if (!compte || compte.status !== "active") return;

  if (!mailEnabled()) {
    /*
     * Sans courrier, il n'y a pas de réinitialisation possible. Le journal est
     * le seul endroit où cela se voit — `env.ts` refuse déjà une
     * configuration partielle, mais pas une absence totale, qui reste un état
     * de marche valable pour une ligue sans courrier.
     */
    logger.warn(
      "demande de réinitialisation sans envoi configuré : personne ne recevra rien",
    );
    return;
  }

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    userId: compte.userId,
    tokenHash: hashResetToken(token),
    expiresAt,
  });

  const lien = absoluteUrl(`/mot-de-passe/${token}`);
  if (!lien) {
    // `env.ts` l'interdit dès que le courrier est configuré ; la garde reste
    // pour que l'invariant soit lisible ici aussi.
    logger.error("PUBLIC_WEB_URL absent : lien de réinitialisation impossible");
    return;
  }

  /*
   * L'envoi n'est pas attendu par l'appelant : il répond immédiatement, et
   * toujours la même chose. Attendre le serveur SMTP ferait varier le temps
   * de réponse selon que le compte existe ou non — la même fuite que celle
   * qu'on vient d'éviter, par un autre canal.
   */
  void sendMail(
    passwordResetMail({
      to: compte.email,
      displayName: compte.displayName,
      url: lien,
      validityMinutes: RESET_TTL_MINUTES,
    }),
  ).catch((error: unknown) => {
    logger.warn({ err: error }, "courrier de réinitialisation non envoyé");
  });
}

/**
 * Consommation d'un jeton et pose du nouveau mot de passe.
 *
 * Tout se fait dans une transaction, et la consommation est conditionnée sur
 * `used_at IS NULL` : deux requêtes qui présentent le même lien à la même
 * seconde ne peuvent pas aboutir toutes les deux.
 */
export async function resetPassword(params: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const tokenHash = hashResetToken(params.token);

  const [ligne] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  /*
   * Les trois refus portent le même message.
   *
   * Un lien inconnu, un lien déjà consommé et un lien périmé appellent la
   * même action de la part de l'utilisateur — en redemander un —, et les
   * distinguer renseignerait qui essaie des jetons au hasard sur ce qu'il a
   * touché. L'écran propose donc directement de recommencer.
   */
  const invalide = new AppError(
    "RULE_VIOLATION",
    "Ce lien n'est plus valable. Demandez-en un nouveau : les liens de " +
      "réinitialisation expirent après une heure et ne servent qu'une fois.",
  );

  if (!ligne) throw invalide;
  if (ligne.usedAt !== null) throw invalide;
  if (ligne.expiresAt.getTime() <= Date.now()) throw invalide;

  const passwordHash = await hashPassword(params.newPassword);

  await db.transaction(async (tx) => {
    const consomme = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.id, ligne.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    // Quelqu'un est passé entre la lecture et l'écriture : le jeton a servi.
    if (Number(consomme[0].affectedRows ?? 0) === 0) throw invalide;

    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, ligne.userId));

    /*
     * Toutes les sessions tombent, comme lors d'un changement ordinaire.
     * C'est le point de la manœuvre : si l'oubli vient d'un compte pris par
     * quelqu'un d'autre, laisser ouvertes les sessions de l'intrus rendrait
     * la réinitialisation inutile.
     */
    await revokeAllSessions(tx, ligne.userId);

    /*
     * Les autres jetons du même compte sont consommés aussi. Un lien demandé
     * trois fois de suite laisse trois jetons vivants : après usage de l'un
     * d'eux, les deux autres n'ont plus de raison d'ouvrir un compte dont le
     * propriétaire vient de reprendre la main.
     */
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, ligne.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    await writeAudit(tx, {
      actorUserId: ligne.userId,
      action: "user.password.reset",
      entityType: "user",
      entityId: ligne.userId,
    });
  });
}

/** Purge les jetons périmés ; appelée avec les autres tâches d'entretien. */
export async function purgeExpiredResetTokens(): Promise<number> {
  const result = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, new Date()));
  return Number(result[0].affectedRows ?? 0);
}
