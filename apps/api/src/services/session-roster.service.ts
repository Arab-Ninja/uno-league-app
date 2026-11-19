import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  notInArray,
} from "drizzle-orm";
import {
  AppError,
  GAME_MODES,
  gabarit,
  type AdminProposalRow,
  type ErrorTemplate,
  type PublicPlayer,
} from "@uno/shared";
import { db, type Transaction } from "../db/client.js";
import {
  matches,
  players,
  proposalParticipants,
  proposalPolls,
  proposalSubstitutes,
  proposals,
  teamMembers,
  teams,
  venues,
  type ProposalRow,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { writeAudit } from "./audit.service.js";
import {
  recomputeStatus,
  refundSeat,
  vacateSeat,
} from "./eligibility.service.js";
import { activePollView } from "./proposal-alternatives.service.js";
import { notifyPlayer } from "./notifications.service.js";
import { offerSeat, payProposal } from "./payments.service.js";
import {
  joinProposal,
  leaveProposal,
  lockProposal,
} from "./proposals.service.js";
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
      venueBookedAt: proposals.venueBookedAt,
      venueBookingUrl: venues.bookingUrl,
      venueId: proposals.venueId,
      slotStartHour: proposals.slotStartHour,
    })
    .from(proposals)
    // La page de réservation vient de la salle, pas de la proposition : une
    // adresse corrigée vaut aussi pour les sessions déjà proposées.
    .leftJoin(venues, eq(venues.slug, proposals.venueId))
    // Une session close ne se compose plus : elle a son classement.
    .where(inArray(proposals.status, ["proposal", "reservation", "session"]))
    .orderBy(asc(proposals.startsAtUtc))
    .limit(50);

  // Les votes en cours ou à trancher (ALT-001) : rares, lus un par un.
  const polls = await db
    .select({ proposalId: proposalPolls.activeProposalId })
    .from(proposalPolls)
    .where(isNotNull(proposalPolls.activeProposalId));
  const withPoll = new Set(polls.map((row) => row.proposalId));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      modeName:
        GAME_MODES.find((mode) => mode.id === row.modeId)?.name ?? row.modeId,
      status: row.status as AdminProposalRow["status"],
      division: row.division as AdminProposalRow["division"],
      venueBookedAt: row.venueBookedAt ? row.venueBookedAt.toISOString() : null,
      venueBookingUrl: row.venueBookingUrl ?? null,
      poll: withPoll.has(row.id) ? await activePollView(row.id) : null,
    })),
  );
}

/**
 * Déclare le terrain d'une session réservé chez l'exploitant, ou retire la
 * déclaration (VENUE-001).
 *
 * L'application ne réserve rien elle-même : la salle se loue sur la
 * plateforme de l'exploitant, et rien ne permet de l'y lire. C'est donc
 * l'administrateur qui le dit, une fois l'acompte versé. La déclaration se
 * retire si la réservation est annulée chez l'exploitant — l'alerte reprend
 * alors son rôle.
 */
export async function setVenueBooked(
  actor: { userId: number },
  input: { proposalId: number; booked: boolean },
): Promise<{ venueBookedAt: string | null }> {
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select({
        status: proposals.status,
        venueBookedAt: proposals.venueBookedAt,
      })
      .from(proposals)
      .where(eq(proposals.id, input.proposalId))
      .limit(1)
      .for("update");

    if (!proposal) {
      throw new AppError("NOT_FOUND", "Cette session est introuvable.");
    }
    if (proposal.status === "completed" || proposal.status === "cancelled") {
      throw new AppError(
        "CONFLICT",
        "Cette session est terminée : son terrain ne se réserve plus.",
      );
    }

    // Déjà dans l'état demandé : rien à écrire, et pas de ligne d'audit
    // pour un double appui.
    if ((proposal.venueBookedAt !== null) === input.booked) {
      return {
        venueBookedAt: proposal.venueBookedAt
          ? proposal.venueBookedAt.toISOString()
          : null,
      };
    }

    const venueBookedAt = input.booked ? new Date() : null;
    await tx
      .update(proposals)
      .set({ venueBookedAt, updatedAt: new Date() })
      .where(eq(proposals.id, input.proposalId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: input.booked
        ? "proposal.venue.booked"
        : "proposal.venue.unbooked",
      entityType: "proposal",
      entityId: input.proposalId,
      before: { venueBookedAt: proposal.venueBookedAt },
      after: { venueBookedAt },
    });

    return {
      venueBookedAt: venueBookedAt ? venueBookedAt.toISOString() : null,
    };
  });
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

/**
 * Une session dont la composition peut encore changer : ni jouée, ni
 * annulée, et sans match validé. Ce qui s'est passé sur le terrain ne se
 * réécrit pas en changeant les noms après coup.
 */
async function assertRosterEditable(
  tx: Transaction,
  proposal: ProposalRow,
): Promise<void> {
  if (
    proposal.status !== "proposal" &&
    proposal.status !== "reservation" &&
    proposal.status !== "session"
  ) {
    throw new AppError(
      "RULE_VIOLATION",
      "Cette session est terminée : sa composition ne change plus.",
    );
  }

  const [validated] = await tx
    .select({ total: count() })
    .from(matches)
    .where(
      and(eq(matches.proposalId, proposal.id), isNotNull(matches.validatedAt)),
    );
  if (Number(validated?.total ?? 0) > 0) {
    throw new AppError(
      "RULE_VIOLATION",
      "Cette session a des matchs validés : sa composition ne peut plus changer.",
    );
  }
}

/** La place d'un inscrit, telle qu'un retrait ou un remplacement la lit. */
async function seatOf(
  tx: Transaction,
  proposalId: number,
  playerId: number,
): Promise<{ id: number; hasPaid: boolean; paymentId: number | null }> {
  const [seat] = await tx
    .select({
      id: proposalParticipants.id,
      hasPaid: proposalParticipants.hasPaid,
      paymentId: proposalParticipants.paymentId,
    })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, playerId),
      ),
    )
    .limit(1);

  if (!seat) {
    throw new AppError(
      "NOT_FOUND",
      "Ce joueur n'est plus inscrit à cette session.",
    );
  }
  return seat;
}

/**
 * Si le partant avait ouvert la proposition, elle revient au plus ancien des
 * inscrits restants — la règle de `leaveProposal`, pour la même raison : une
 * proposition ne reste pas orpheline.
 */
async function handOverCreator(
  tx: Transaction,
  proposal: ProposalRow,
  leaverId: number,
): Promise<void> {
  if (proposal.creatorPlayerId !== leaverId) return;

  const [heir] = await tx
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposal.id),
        ne(proposalParticipants.playerId, leaverId),
      ),
    )
    .orderBy(asc(proposalParticipants.joinedAt), asc(proposalParticipants.id))
    .limit(1);

  if (heir) {
    await tx
      .update(proposals)
      .set({ creatorPlayerId: heir.playerId, updatedAt: new Date() })
      .where(eq(proposals.id, proposal.id));
  }
}

/**
 * Retire un joueur (ADMIN-016).
 *
 * Tant que la séance est ouverte, c'est une désinscription ordinaire. Une
 * fois le plateau complet, le joueur, lui, ne peut plus partir seul — c'est
 * à l'administration de le faire, et elle le fait d'ici : sa place réglée
 * lui est remboursée en UNO (sauf si l'administrateur en décide autrement,
 * pour un forfait de dernière minute), un remplaçant en attente la reprend
 * s'il y en a un, et sinon la séance redevient incomplète et ses inscrits en
 * sont prévenus.
 *
 * Pour garder la séance complète en changeant un nom, c'est
 * `replaceParticipant` qu'il faut : ce retrait-ci rouvre la séance.
 */
export async function removeParticipant(
  actor: { userId: number },
  input: { proposalId: number; playerId: number; refund?: boolean },
): Promise<{ refundedUno: number }> {
  const target = await identityOf(input.playerId);

  const [current] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, input.proposalId))
    .limit(1);
  if (!current) throw new AppError("NOT_FOUND", "Session introuvable.");

  if (current.status === "proposal") {
    await leaveProposal(target, input.proposalId);
    await writeAudit(db, {
      actorUserId: actor.userId,
      action: "proposal.participant.remove",
      entityType: "proposal",
      entityId: input.proposalId,
      before: { playerId: input.playerId },
    });
    return { refundedUno: 0 };
  }

  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    await assertRosterEditable(tx, proposal);
    const seat = await seatOf(tx, proposal.id, input.playerId);

    const refundedUno =
      seat.hasPaid && input.refund !== false && proposal.priceUno > 0
        ? await refundSeat(tx, proposal, {
            playerId: input.playerId,
            paymentId: seat.paymentId,
          })
        : 0;

    const { replacementPlayerId, status } = await vacateSeat(tx, proposal, {
      id: seat.id,
      playerId: input.playerId,
    });
    await handOverCreator(tx, proposal, input.playerId);

    await notifyPlayer(
      {
        playerId: input.playerId,
        eventKey: `proposal:${proposal.id}:removed:${seat.id}`,
        category: "sessions",
        title: gabarit("Place libérée"),
        body: [
          gabarit(
            "L'administration vous a retiré de la session du {jour} à {salle}.",
            { jour: { jour: proposal.localDate }, salle: proposal.venueName },
          ),
          ...(refundedUno > 0
            ? [
                gabarit("{montant} UNO vous ont été remboursés.", {
                  montant: refundedUno,
                }),
              ]
            : []),
        ],
      },
      tx,
    );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.participant.remove",
      entityType: "proposal",
      entityId: proposal.id,
      before: { playerId: input.playerId, hasPaid: seat.hasPaid },
      after: { refundedUno, replacementPlayerId, status },
    });

    return { refundedUno };
  });
}

/**
 * Remplace un inscrit par un autre joueur (ADMIN-016).
 *
 * Le geste de la veille d'un match : un joueur se désiste, un autre prend sa
 * place. **La place change de titulaire, elle ne disparaît pas** — même camp,
 * même poste, même rang dans l'équipe —, si bien que la séance reste
 * complète et confirmée, et qu'aucun autre inscrit n'est dérangé.
 *
 * Une place réglée passe par défaut au remplaçant telle quelle : les deux
 * joueurs s'arrangent entre eux, et la séance ne perd pas sa confirmation à
 * la veille du coup d'envoi. Si l'administrateur demande le remboursement,
 * le partant est recrédité en UNO et le remplaçant doit régler à son tour :
 * la séance repasse alors en réservation, avec un délai de paiement.
 *
 * Les règles d'éligibilité tiennent toujours : la division d'une séance de
 * ligue (CAL-002) et le rôle exclusif d'arbitre (ROLE-003). Les contourner
 * ici, le balayage d'éligibilité retirerait le remplaçant aussitôt après.
 */
export async function replaceParticipant(
  actor: { userId: number },
  input: {
    proposalId: number;
    outPlayerId: number;
    inPlayerId: number;
    refund?: boolean;
  },
): Promise<{ refundedUno: number; seatPaid: boolean }> {
  if (input.outPlayerId === input.inPlayerId) {
    throw new AppError(
      "RULE_VIOLATION",
      "Choisissez un autre joueur que celui qui sort.",
    );
  }

  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    await assertRosterEditable(tx, proposal);
    const seat = await seatOf(tx, proposal.id, input.outPlayerId);

    const [newcomer] = await tx
      .select({ division: players.division, accountType: players.accountType })
      .from(players)
      .where(eq(players.id, input.inPlayerId))
      .limit(1);
    if (!newcomer) throw new AppError("NOT_FOUND", "Joueur introuvable.");

    if (newcomer.accountType === "referee") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un compte arbitre ne participe pas comme joueur. Proposez-vous comme arbitre.",
      );
    }
    if (proposal.division !== null && newcomer.division !== proposal.division) {
      throw new AppError(
        "RULE_VIOLATION",
        gabarit("Cette session est réservée à la division {division}.", {
          division: proposal.division,
        }),
      );
    }

    const [already] = await tx
      .select({ id: proposalParticipants.id })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposal.id),
          eq(proposalParticipants.playerId, input.inPlayerId),
        ),
      )
      .limit(1);
    if (already) {
      throw new AppError(
        "CONFLICT",
        "Ce joueur est déjà inscrit à cette session.",
      );
    }

    const refundedUno =
      seat.hasPaid && input.refund === true && proposal.priceUno > 0
        ? await refundSeat(tx, proposal, {
            playerId: input.outPlayerId,
            paymentId: seat.paymentId,
          })
        : 0;
    const seatPaid = seat.hasPaid && input.refund !== true;

    // La même ligne change de titulaire : camp et poste (`side`,
    // `pitchSlot`) restent ceux de la place.
    await tx
      .update(proposalParticipants)
      .set({
        playerId: input.inPlayerId,
        hasPaid: seatPaid,
        paymentId: seatPaid ? seat.paymentId : null,
        joinedAt: new Date(),
        replacedPlayerId: input.outPlayerId,
      })
      .where(eq(proposalParticipants.id, seat.id));

    // Et dans l'équipe, s'il y en a une : le remplaçant y prend son poste.
    const squads = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.proposalId, proposal.id));
    if (squads.length > 0) {
      await tx
        .update(teamMembers)
        .set({ playerId: input.inPlayerId })
        .where(
          and(
            inArray(
              teamMembers.teamId,
              squads.map((squad) => squad.id),
            ),
            eq(teamMembers.playerId, input.outPlayerId),
          ),
        );
    }

    // Le remplaçant quitte la file d'attente s'il y était, et le partant
    // n'y reste pas non plus.
    await tx
      .update(proposalSubstitutes)
      .set({
        status: "promoted",
        replacedPlayerId: input.outPlayerId,
        promotedAt: new Date(),
      })
      .where(
        and(
          eq(proposalSubstitutes.proposalId, proposal.id),
          eq(proposalSubstitutes.playerId, input.inPlayerId),
          eq(proposalSubstitutes.status, "waiting"),
        ),
      );
    await tx
      .update(proposalSubstitutes)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(proposalSubstitutes.proposalId, proposal.id),
          eq(proposalSubstitutes.playerId, input.outPlayerId),
        ),
      );

    await handOverCreator(tx, proposal, input.outPlayerId);
    const status = await recomputeStatus(tx, proposal, true);

    const seance = {
      jour: { jour: proposal.localDate },
      salle: proposal.venueName,
    };

    await notifyPlayer(
      {
        playerId: input.outPlayerId,
        eventKey: `proposal:${proposal.id}:replaced:${seat.id}:${input.inPlayerId}`,
        category: "sessions",
        title: gabarit("Place réattribuée"),
        body: [
          gabarit(
            "L'administration a attribué votre place du {jour} à {salle} à un autre joueur.",
            seance,
          ),
          ...(refundedUno > 0
            ? [
                gabarit("{montant} UNO vous ont été remboursés.", {
                  montant: refundedUno,
                }),
              ]
            : []),
        ],
      },
      tx,
    );

    await notifyPlayer(
      {
        playerId: input.inPlayerId,
        eventKey: `proposal:${proposal.id}:seat-taken:${seat.id}:${input.outPlayerId}`,
        category: "sessions",
        title: gabarit("Une place vous revient"),
        body: seatPaid
          ? gabarit(
              "Vous entrez dans la session du {jour} à {salle}. Votre place est déjà réglée : rendez-vous sur le terrain.",
              seance,
            )
          : status === "reservation"
            ? gabarit(
                "Vous entrez dans la session du {jour} à {salle}. Réglez votre place pour la confirmer.",
                seance,
              )
            : // Séance encore ouverte, ou gratuite : rien à régler.
              gabarit(
                "L'administration vous a inscrit à la session du {jour} à {salle}.",
                seance,
              ),
        url: `/sessions/${proposal.id}`,
      },
      tx,
    );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.participant.replace",
      entityType: "proposal",
      entityId: proposal.id,
      before: { playerId: input.outPlayerId, hasPaid: seat.hasPaid },
      after: { playerId: input.inPlayerId, seatPaid, refundedUno, status },
    });

    return { refundedUno, seatPaid };
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
): Promise<{
  added: number;
  failed: { playerId: number; reason: ErrorTemplate }[];
}> {
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
  const failed: { playerId: number; reason: ErrorTemplate }[] = [];
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
        reason:
          error instanceof AppError
            ? gabarit(error.gabarit, error.valeurs)
            : gabarit("Échec inattendu."),
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
  failed: { playerId: number; reason: ErrorTemplate }[];
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

  const failed: { playerId: number; reason: ErrorTemplate }[] = [];
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
        reason:
          error instanceof AppError
            ? gabarit(error.gabarit, error.valeurs)
            : gabarit("Échec inattendu."),
      });
    }
  }

  return { settled, failed };
}

/**
 * Offre les places d'une réservation : la ligue les prend à sa charge
 * (ADMIN-013).
 *
 * Le geste des séances offertes au lancement : une fois la proposition
 * complète, l'administration règle d'un clic la place de chaque joueur
 * présent, sans toucher à sa caisse. Dans l'ordre d'inscription — « les
 * premiers inscrits » de l'annonce — et seulement jusqu'au quota : la
 * dernière place offerte fait basculer la session, et les remplaçants au-delà
 * n'ont plus de place à recevoir.
 *
 * Une place déjà réglée par son joueur est laissée telle quelle : elle n'est
 * plus due. Un échec n'arrête pas la série, comme au règlement.
 */
export async function offerSeats(
  actor: { userId: number },
  input: { proposalId: number },
): Promise<{
  offered: number;
  failed: { playerId: number; reason: ErrorTemplate }[];
}> {
  const [proposal] = await db
    .select({
      status: proposals.status,
      venueName: proposals.venueName,
      localDate: proposals.localDate,
      localTimeLabel: proposals.localTimeLabel,
    })
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
    )
    .orderBy(asc(proposalParticipants.joinedAt), asc(proposalParticipants.id));

  const offeredTo: number[] = [];
  const failed: { playerId: number; reason: ErrorTemplate }[] = [];

  for (const seat of unpaid) {
    try {
      const outcome = await offerSeat({
        proposalId: input.proposalId,
        playerId: seat.playerId,
      });
      offeredTo.push(seat.playerId);
      // Le quota est atteint : la session est confirmée, les inscrits
      // restants ont été retirés avec leur place impayée.
      if (outcome.status !== "reservation") break;
    } catch (error) {
      failed.push({
        playerId: seat.playerId,
        reason:
          error instanceof AppError
            ? gabarit(error.gabarit, error.valeurs)
            : gabarit("Échec inattendu."),
      });
    }
  }

  await writeAudit(db, {
    actorUserId: actor.userId,
    action: "proposal.seats.offer",
    entityType: "proposal",
    entityId: input.proposalId,
    after: { offered: offeredTo.length, playerIds: offeredTo },
  });

  // Après les écritures : un envoi raté ne défait pas une place offerte.
  for (const playerId of offeredTo) {
    try {
      await notifyPlayer(
        {
          playerId,
          eventKey: `proposal:${input.proposalId}:offered`,
          category: "payments",
          title: gabarit("Place offerte"),
          body: gabarit(
            "{salle}, le {jour} à {heure} : UNO League vous offre votre place. Rien à régler, rendez-vous sur le terrain.",
            {
              salle: proposal.venueName,
              jour: { jour: proposal.localDate },
              heure: proposal.localTimeLabel,
            },
          ),
          url: `/sessions/${input.proposalId}`,
        },
        db,
      );
    } catch (error) {
      logger.warn({ err: error, playerId }, "place offerte non notifiée");
    }
  }

  return { offered: offeredTo.length, failed };
}
