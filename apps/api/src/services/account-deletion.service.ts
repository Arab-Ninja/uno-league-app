import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { AppError, gabarit } from "@uno/shared";
import { db } from "../db/client.js";
import {
  deviceTokens,
  passwordResetTokens,
  players,
  squadMembers,
  squads,
  users,
} from "../db/schema.js";
import { hashPassword } from "../lib/password.js";
import { revokeAllSessions } from "./auth.service.js";
import { writeAudit } from "./audit.service.js";
import { debit } from "./ledger.service.js";

/**
 * Suppression d'un compte joueur (RGPD, ADMIN-012).
 *
 * **Pourquoi cette fonction existe.** La page publique
 * `/suppression-compte.html`, déclarée à Google Play, promet d'effacer un
 * compte sur demande en trente jours. Rien dans l'application ne permettait de
 * le faire : la purge de l'administration couvre les sessions et les clubs,
 * pas les comptes. Une politique publiée qu'on ne peut pas exécuter est pire
 * que pas de politique du tout.
 *
 * **Anonymiser, et non effacer la ligne.** Ce n'est pas une demi-mesure, c'est
 * la seule forme possible, pour deux raisons qui se rejoignent :
 *
 * 1. *Le droit.* Le registre financier se conserve sept ans en Belgique, et
 *    les résultats sportifs ne s'effacent pas — retirer un joueur d'une
 *    rencontre déjà jouée fausserait le score des autres. La page publique dit
 *    exactement cela, et cette fonction en est l'exécution.
 * 2. *Le modèle.* Commandes, paiements, feuilles de match et appartenances de
 *    club renvoient au joueur par des clés étrangères en `restrict`. Une
 *    suppression physique échouerait sur la première.
 *
 * Ce qui disparaît, c'est donc le lien entre les lignes et une personne : plus
 * d'adresse e-mail, plus de nom, plus de photo, plus de date de naissance. Ce
 * qui reste ne désigne plus personne.
 *
 * **Ce que cette fonction ne fait pas, volontairement.** Elle ne retire pas le
 * joueur des propositions à venir. Une place déjà réglée lui reste acquise —
 * la page publique l'annonce —, et une place non réglée tombe d'elle-même :
 * l'échéance des vingt-quatre heures la rend aux remplaçants, exactement comme
 * pour un joueur vivant qui ne paierait pas. Le domaine sait déjà traiter un
 * inscrit qui ne donne plus signe de vie ; lui ajouter un chemin parallèle
 * aurait créé une seconde vérité.
 */

/** Ce que l'écran de confirmation montre avant d'agir. */
export interface AccountDeletionPreview {
  playerId: number;
  displayName: string;
  email: string;
  unoPoints: number;
  /** Club dont ce joueur est fondateur, s'il y en a un : c'est un motif de refus. */
  foundedSquadName: string | null;
  isAdmin: boolean;
  isSelf: boolean;
  alreadyDeleted: boolean;
}

export interface AccountDeletionResult {
  playerId: number;
  unoReclaimed: number;
  squadsLeft: number;
  devicesRemoved: number;
}

/** Le nom que porteront désormais les lignes qui citaient ce joueur. */
const ANONYMOUS_NAME = "Joueur supprimé";

/**
 * L'adresse de remplacement.
 *
 * `.invalid` est réservé par la RFC 2606 : aucun domaine ne peut l'obtenir,
 * donc aucun courrier ne partira jamais vers elle par accident. L'identifiant
 * du compte la rend unique, ce que la contrainte de la table exige.
 */
function tombstoneEmail(userId: number): string {
  return `supprime.${userId}@comptes.unoleague.invalid`;
}

async function loadTarget(playerId: number) {
  const [row] = await db
    .select({
      playerId: players.id,
      userId: users.id,
      displayName: players.displayName,
      email: users.email,
      unoPoints: players.unoPoints,
      role: users.role,
      status: users.status,
    })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(eq(players.id, playerId))
    .limit(1);

  return row ?? null;
}

async function foundedSquadOf(playerId: number): Promise<string | null> {
  const [row] = await db
    .select({ name: squads.name })
    .from(squads)
    .where(
      and(eq(squads.founderPlayerId, playerId), eq(squads.status, "active")),
    )
    .limit(1);

  return row?.name ?? null;
}

/**
 * Ce que l'administration lit avant de confirmer.
 *
 * L'écran doit pouvoir dire ce qui va être perdu — un solde en particulier —
 * et pourquoi l'opération sera refusée, avant que l'administrateur n'ait
 * cliqué. Découvrir le refus après la confirmation donne le sentiment d'avoir
 * cassé quelque chose.
 */
export async function previewAccountDeletion(
  actor: { userId: number },
  input: { playerId: number },
): Promise<AccountDeletionPreview> {
  const target = await loadTarget(input.playerId);
  if (!target) throw new AppError("NOT_FOUND", "Ce joueur n'existe pas.");

  return {
    playerId: target.playerId,
    displayName: target.displayName,
    email: target.email,
    unoPoints: target.unoPoints,
    foundedSquadName: await foundedSquadOf(target.playerId),
    isAdmin: target.role === "admin",
    isSelf: target.userId === actor.userId,
    alreadyDeleted: target.status === "anonymized",
  };
}

/**
 * Supprime le compte.
 *
 * Trois refus, et chacun protège d'une situation dont on ne sort pas :
 *
 * - **son propre compte** : l'administrateur se fermerait la porte, et la
 *   ligue n'aurait plus personne pour l'ouvrir ;
 * - **un autre administrateur** : il faut d'abord lui retirer son rôle. Le
 *   geste en deux temps est délibéré — supprimer un administrateur par
 *   mégarde, depuis une liste où il ressemble à tout le monde, coûterait cher ;
 * - **le fondateur d'un club actif** : le club se retrouverait sans tête, avec
 *   une caisse que plus personne ne peut redistribuer. Il faut dissoudre le
 *   club ou transmettre la fondation d'abord.
 */
export async function deleteAccount(
  actor: { userId: number },
  input: { playerId: number },
): Promise<AccountDeletionResult> {
  const target = await loadTarget(input.playerId);
  if (!target) throw new AppError("NOT_FOUND", "Ce joueur n'existe pas.");

  if (target.status === "anonymized") {
    throw new AppError("RULE_VIOLATION", "Ce compte est déjà supprimé.");
  }
  if (target.userId === actor.userId) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous ne pouvez pas supprimer votre propre compte depuis l'administration.",
    );
  }
  if (target.role === "admin") {
    throw new AppError(
      "RULE_VIOLATION",
      "Ce compte est administrateur. Retirez-lui d'abord ce rôle, puis supprimez-le.",
    );
  }

  const foundedSquad = await foundedSquadOf(target.playerId);
  if (foundedSquad) {
    throw new AppError(
      "RULE_VIOLATION",
      gabarit(
        "Ce joueur a fondé le club « {club} ». Dissolvez le club ou transmettez-en la fondation avant de supprimer le compte.",
        { club: foundedSquad },
      ),
    );
  }

  /*
   * Le mot de passe est remplacé par l'empreinte d'un secret aléatoire que
   * personne ne connaît — pas même ce processus une fois la fonction rendue.
   * Écrire une chaîne arbitraire dans la colonne aurait produit une empreinte
   * malformée, et `verifyPassword` lève sur un format qu'il ne reconnaît pas :
   * une connexion sur ce compte renverrait alors une erreur serveur au lieu
   * d'un refus.
   */
  const unusablePassword = await hashPassword(randomBytes(32).toString("hex"));
  const now = new Date();

  return db.transaction(async (tx) => {
    /*
     * Le solde part par une écriture au registre, jamais par une remise à zéro
     * de la colonne : le solde d'un joueur vaut la somme de son historique
     * (WAL-006), et écrire `0` directement romprait cette égalité pour
     * toujours — y compris sur un compte dont le registre, lui, se conserve
     * sept ans.
     */
    let unoReclaimed = 0;
    if (target.unoPoints > 0) {
      await debit(tx, {
        playerId: target.playerId,
        amount: target.unoPoints,
        type: "admin_debit",
        description: "Solde repris à la fermeture du compte",
        referenceType: "admin",
        referenceId: actor.userId,
      });
      unoReclaimed = target.unoPoints;
    }

    // Les appartenances de club actives deviennent des départs ordinaires.
    const left = await tx
      .update(squadMembers)
      .set({ status: "left", leftAt: now, listedAt: null })
      .where(
        and(
          eq(squadMembers.playerId, target.playerId),
          eq(squadMembers.status, "active"),
        ),
      );

    // Plus aucun appareil ne doit être joignable au nom de ce compte.
    const devices = await tx
      .delete(deviceTokens)
      .where(eq(deviceTokens.playerId, target.playerId));

    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, target.userId));

    await revokeAllSessions(tx, target.userId);

    await tx
      .update(players)
      .set({
        firstName: ANONYMOUS_NAME,
        lastName: "",
        displayName: ANONYMOUS_NAME,
        address: null,
        // `date_of_birth` et `nationality` n'acceptent pas NULL. Des valeurs
        // manifestement fictives valent mieux qu'une date plausible : personne
        // ne peut les prendre pour une information.
        dateOfBirth: "1900-01-01",
        nationality: "ZZ",
        profilePhotoUrl: null,
        isSupervisor: false,
        updatedAt: now,
      })
      .where(eq(players.id, target.playerId));

    await tx
      .update(users)
      .set({
        email: tombstoneEmail(target.userId),
        passwordHash: unusablePassword,
        status: "anonymized",
        updatedAt: now,
      })
      .where(eq(users.id, target.userId));

    /*
     * La trace ne contient **ni l'adresse, ni le nom** du compte supprimé.
     * Le journal se conserve douze mois : y recopier l'identité qu'on vient
     * d'effacer rendrait l'opération vaine pendant un an. Les identifiants
     * suffisent à savoir quel compte a été fermé, par qui et quand — c'est ce
     * qu'on demande à un journal d'administration.
     */
    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "user.account.delete",
      entityType: "player",
      entityId: target.playerId,
      after: {
        userId: target.userId,
        unoReclaimed,
        devicesRemoved: Number(devices[0].affectedRows ?? 0),
      },
    });

    return {
      playerId: target.playerId,
      unoReclaimed,
      squadsLeft: Number(left[0].affectedRows ?? 0),
      devicesRemoved: Number(devices[0].affectedRows ?? 0),
    };
  });
}
