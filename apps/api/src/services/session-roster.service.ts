import { and, asc, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import {
  AppError,
  GAME_MODES,
  type AdminProposalRow,
  type PublicPlayer,
} from "@uno/shared";
import { db } from "../db/client.js";
import { players, proposalParticipants, proposals } from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { payProposal } from "./payments.service.js";
import { joinProposal, leaveProposal } from "./proposals.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";

/**
 * Composition d'une session par l'administration (ADMIN-008).
 *
 * L'application se teste mal de l'extérieur. Pour voir une session de ligue
 * aller jusqu'au classement, il faut quinze comptes, quinze connexions,
 * quinze paiements — une demi-heure de manipulation avant de pouvoir juger
 * quoi que ce soit. Cet outil fait le même chemin en trois clics.
 *
 * **Le même chemin, et c'est tout l'enjeu.** Inscrire un joueur d'ici appelle
 * `joinProposal`, et régler sa place appelle `payProposal` : division
 * contrôlée, compte arbitre refusé, quota, échéance des vingt-quatre heures,
 * caisse débitée, écriture au registre, bascule en réservation puis en
 * session. Un raccourci qui écrirait directement en base composerait des
 * séances qu'aucun joueur n'aurait pu former, et ne prouverait rien de ce
 * qu'on cherche à vérifier.
 *
 * Ce que l'administration gagne n'est donc pas une dérogation, c'est de
 * pouvoir agir **au nom d'un autre**. L'audit le dit : l'acteur est
 * l'administrateur, le bénéficiaire est nommé à côté.
 */

/** Le carnet d'un joueur, tel que l'appel au nom d'autrui l'exige. */
async function identityOf(
  playerId: number,
): Promise<{ playerId: number; userId: number }> {
  const [row] = await db
    .select({ id: players.id, userId: players.userId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Joueur introuvable.");
  return { playerId: row.id, userId: row.userId };
}

/**
 * Les sessions que l'administration peut composer.
 *
 * Requête à part plutôt que `listProposals` : cette dernière masque les
 * sessions de ligue des autres divisions, ce qui est juste pour un joueur et
 * faux ici — un administrateur de D3 doit pouvoir composer une session de D1.
 */
export async function listForAdmin(): Promise<AdminProposalRow[]> {
  const rows = await db
    .select({
      id: proposals.id,
      modeId: proposals.modeId,
      venueName: proposals.venueName,
      localDate: proposals.localDate,
      localTimeLabel: proposals.localTimeLabel,
      status: proposals.status,
      division: proposals.division,
      participantCount: proposals.participantCount,
      paidCount: proposals.paidCount,
      minParticipants: proposals.minParticipants,
      priceUno: proposals.priceUno,
    })
    .from(proposals)
    // Une session close ne se compose plus : elle a son classement.
    .where(inArray(proposals.status, ["proposal", "reservation", "session"]))
    .orderBy(asc(proposals.startsAtUtc))
    .limit(50);

  return rows.map((row) => ({
    ...row,
    modeName:
      GAME_MODES.find((mode) => mode.id === row.modeId)?.name ?? row.modeId,
    status: row.status as AdminProposalRow["status"],
    division: row.division as AdminProposalRow["division"],
  }));
}

/**
 * Les joueurs qu'on peut encore inscrire sur cette session.
 *
 * La liste est filtrée ici plutôt qu'à l'écran : proposer un nom que
 * `joinProposal` refusera — un arbitre, un joueur d'une autre division, un
 * inscrit — fait découvrir la règle par l'échec, une fois sur deux.
 */
export async function eligibleFor(proposalId: number): Promise<PublicPlayer[]> {
  const [proposal] = await db
    .select({ division: proposals.division })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) throw new AppError("NOT_FOUND", "Session introuvable.");

  const enrolled = await db
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));

  // ROLE-003 : un arbitre ne prend pas de place de joueur.
  const conditions = [ne(players.accountType, "referee")];

  // CAL-002 : une session de ligue est réservée à sa division ; un amical
  // n'en porte aucune et s'ouvre à tout le monde.
  if (proposal.division !== null) {
    conditions.push(eq(players.division, proposal.division));
  }

  // `notInArray` sur une liste vide produit un SQL invalide : la condition
  // n'est posée que lorsqu'il y a effectivement quelqu'un à exclure.
  if (enrolled.length > 0) {
    conditions.push(
      notInArray(
        players.id,
        enrolled.map((row) => row.playerId),
      ),
    );
  }

  const rows = await db
    .select(publicPlayerColumns)
    .from(players)
    .where(and(...conditions))
    .orderBy(desc(players.rating), asc(players.id))
    .limit(100);

  return rows.map(toPublicPlayer);
}

/**
 * Inscrit un joueur.
 *
 * Inscrire et régler sont deux gestes, et le domaine l'impose : `payProposal`
 * refuse une proposition encore ouverte — on ne paie qu'une réservation, donc
 * qu'un plateau déjà complet (CAL-009). Un « inscrire et régler » d'un seul
 * tenant aurait donc échoué sur chaque joueur sauf le dernier.
 */
export async function addParticipant(
  actor: { userId: number },
  input: { proposalId: number; playerId: number },
): Promise<void> {
  const target = await identityOf(input.playerId);
  await joinProposal(target, input.proposalId);

  await writeAudit(db, {
    actorUserId: actor.userId,
    action: "proposal.participant.add",
    entityType: "proposal",
    entityId: input.proposalId,
    after: { playerId: input.playerId },
  });
}

/** Retire un joueur, selon les mêmes règles qu'une désinscription ordinaire. */
export async function removeParticipant(
  actor: { userId: number },
  input: { proposalId: number; playerId: number },
): Promise<void> {
  const target = await identityOf(input.playerId);
  await leaveProposal(target, input.proposalId);

  await writeAudit(db, {
    actorUserId: actor.userId,
    action: "proposal.participant.remove",
    entityType: "proposal",
    entityId: input.proposalId,
    before: { playerId: input.playerId },
  });
}

/**
 * Complète le plateau d'un coup.
 *
 * Quinze inscriptions à la main, c'est quinze occasions de se tromper de nom
 * et le temps qu'il faut pour renoncer à essayer. Les places restantes sont
 * prises par les joueurs éligibles les mieux notés — un ordre arbitraire mais
 * stable, ce qui suffit : on cherche une session à observer, pas une équipe à
 * aligner.
 */
export async function fillProposal(
  actor: { userId: number },
  input: { proposalId: number },
): Promise<{ added: number; failed: { playerId: number; reason: string }[] }> {
  const [proposal] = await db
    .select({
      participantCount: proposals.participantCount,
      minParticipants: proposals.minParticipants,
      status: proposals.status,
    })
    .from(proposals)
    .where(eq(proposals.id, input.proposalId))
    .limit(1);

  if (!proposal) throw new AppError("NOT_FOUND", "Session introuvable.");
  if (proposal.status !== "proposal") {
    throw new AppError(
      "RULE_VIOLATION",
      "Le plateau de cette session est déjà complet.",
    );
  }

  const missing = proposal.minParticipants - proposal.participantCount;
  if (missing <= 0) return { added: 0, failed: [] };

  const candidates = (await eligibleFor(input.proposalId)).slice(0, missing);
  const failed: { playerId: number; reason: string }[] = [];
  let added = 0;

  for (const candidate of candidates) {
    try {
      await addParticipant(actor, {
        proposalId: input.proposalId,
        playerId: candidate.id,
      });
      added += 1;
    } catch (error) {
      failed.push({
        playerId: candidate.id,
        reason: error instanceof AppError ? error.message : "échec inattendu",
      });
    }
  }

  return { added, failed };
}

/**
 * Règle toutes les places encore dues, en UNO.
 *
 * C'est le second geste, et il n'existe qu'une fois le plateau complet : la
 * session est alors en réservation, et le paiement s'ouvre. Chaque place passe
 * par `payProposal` — la caisse du joueur est prélevée pour de bon, le
 * registre écrit, et la dernière place réglée fait basculer la session.
 *
 * Un solde insuffisant n'arrête pas la série : on compte ce qui est passé et
 * on nomme ce qui a échoué. Tout annuler pour une caisse vide rendrait l'outil
 * inutilisable sur un jeu d'essai, où les soldes sont ce qu'ils sont.
 */
export async function settleProposal(
  actor: { userId: number },
  input: { proposalId: number },
): Promise<{
  settled: number;
  failed: { playerId: number; reason: string }[];
}> {
  const [proposal] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, input.proposalId))
    .limit(1);

  if (!proposal) throw new AppError("NOT_FOUND", "Session introuvable.");
  if (proposal.status !== "reservation") {
    throw new AppError(
      "RULE_VIOLATION",
      proposal.status === "proposal"
        ? "Le plateau n'est pas complet : le paiement n'est pas encore ouvert."
        : "Cette session n'attend plus de paiement.",
    );
  }

  const unpaid = await db
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, input.proposalId),
        eq(proposalParticipants.hasPaid, false),
      ),
    );

  const failed: { playerId: number; reason: string }[] = [];
  let settled = 0;

  for (const seat of unpaid) {
    try {
      const target = await identityOf(seat.playerId);
      await payProposal(target, {
        proposalId: input.proposalId,
        method: "uno",
        // La clé rend l'opération idempotente : une double pression ne
        // provoque pas deux débits.
        idempotencyKey: `admin:${input.proposalId}:${seat.playerId}`,
      });
      settled += 1;
    } catch (error) {
      failed.push({
        playerId: seat.playerId,
        reason: error instanceof AppError ? error.message : "échec inattendu",
      });
    }
  }

  return { settled, failed };
}
