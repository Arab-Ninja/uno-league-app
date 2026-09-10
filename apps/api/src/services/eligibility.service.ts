import { and, asc, count, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { AppError, PAYMENT_DEADLINE_HOURS, type Division } from "@uno/shared";
import { db, type Transaction } from "../db/client.js";
import {
  matches,
  payments,
  players,
  proposalParticipants,
  proposalSubstitutes,
  proposals,
  teamMembers,
  teams,
  type ProposalRow,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { credit } from "./ledger.service.js";
import { notifyPlayer } from "./notifications.service.js";
import { lockProposal } from "./proposals.service.js";

/**
 * Éligibilité d'un joueur à une session UNO League (CAL-002).
 *
 * `joinProposal` vérifie la division au moment de l'inscription, et c'est
 * insuffisant : la division d'un joueur **change en cours de route**. Une
 * clôture de session fait monter les cinq premiers et descendre les cinq
 * derniers (RANK-005), et le joueur reste inscrit à ses autres sessions,
 * désormais dans la mauvaise division.
 *
 * Ce n'est pas un cas limite mais le cas courant : un joueur inscrit au
 * mercredi et au vendredi est promu dès la saisie du mercredi. Sans ce
 * balayage, une réservation D2 finit par contenir des D1 et des D3.
 *
 * **La division réelle prime toujours sur celle du jour de l'inscription.**
 * Une place devenue inéligible est retirée : reprise par un remplaçant de la
 * bonne division s'il y en a un, libérée sinon — et la session qui n'a plus
 * son compte redevient une proposition ouverte aux inscriptions.
 *
 * Le même traitement vaut pour un arbitre : son rôle est exclusif, il ne peut
 * pas occuper une place de joueur (ROLE-003).
 */

/** Ce qu'une place retirée a produit, pour les compteurs et les tests. */
export interface SeatPurge {
  proposalId: number;
  removedPlayerId: number;
  /** Remplaçant ayant repris la place, ou `null` si elle a été libérée. */
  replacementPlayerId: number | null;
  refundedUno: number;
  /** La session est redescendue au statut proposition, faute de joueurs. */
  reopened: boolean;
  /** Elle était confirmée et ne l'est plus : les autres inscrits sont prévenus. */
  lostConfirmation: boolean;
}

/** Statuts d'une session à venir, où une place peut encore être corrigée. */
const OPEN_STATUSES = ["proposal", "reservation", "session"] as const;

/**
 * Motif d'inéligibilité, pour écrire au joueur la vraie raison.
 * Un « vous avez été retiré » sans explication passerait pour une erreur.
 */
type Reason = { kind: "division"; division: Division } | { kind: "referee" };

function reasonForPlayer(reason: Reason, proposal: ProposalRow): string {
  return reason.kind === "referee"
    ? `Votre compte est un compte arbitre : il ne peut pas occuper une place de joueur. ` +
        `Votre place du ${proposal.localDate} à ${proposal.venueName} a été libérée.`
    : `Votre place du ${proposal.localDate} à ${proposal.venueName} était réservée ` +
        `à la division ${proposal.division}. Vous êtes désormais en ${reason.division}, ` +
        `elle a donc été libérée.`;
}

/**
 * Rembourse une place réglée, **toujours en points UNO**.
 *
 * Un paiement en euros n'est pas remboursable automatiquement — l'API du
 * prestataire n'est pas sollicitée ici — mais le joueur ne doit pas attendre
 * pour autant : il est crédité du prix de la session en UNO. Le montant vient
 * de la proposition, jamais du client (§24).
 *
 * La clé d'idempotence porte l'identifiant du paiement quand il existe : un
 * balayage rejoué ne rembourse pas deux fois, et un joueur qui reviendrait
 * dans la session après un nouveau paiement obtient bien une nouvelle clé.
 */
async function refundSeat(
  tx: Transaction,
  proposal: ProposalRow,
  seat: { playerId: number; paymentId: number | null },
): Promise<number> {
  const key = seat.paymentId
    ? `refund:payment:${seat.paymentId}`
    : `refund:seat:${proposal.id}:${seat.playerId}`;

  await credit(tx, {
    playerId: seat.playerId,
    amount: proposal.priceUno,
    type: "refund",
    description: `Remboursement — session du ${proposal.localDate} à ${proposal.venueName}`,
    referenceType: "proposal",
    referenceId: proposal.id,
    idempotencyKey: key,
  });

  if (seat.paymentId !== null) {
    await tx
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(and(eq(payments.id, seat.paymentId), eq(payments.status, "paid")));
  }

  return proposal.priceUno;
}

/** Premier remplaçant en attente qui est, lui, éligible. */
async function nextEligibleSubstitute(
  tx: Transaction,
  proposal: ProposalRow,
): Promise<number | null> {
  const conditions = [
    eq(proposalSubstitutes.proposalId, proposal.id),
    eq(proposalSubstitutes.status, "waiting"),
    // Un arbitre ne prend pas une place de joueur, même par la file d'attente.
    eq(players.accountType, "player"),
  ];
  if (proposal.division !== null) {
    conditions.push(eq(players.division, proposal.division));
  }

  const [row] = await tx
    .select({ playerId: proposalSubstitutes.playerId })
    .from(proposalSubstitutes)
    .innerJoin(players, eq(players.id, proposalSubstitutes.playerId))
    .where(and(...conditions))
    .orderBy(asc(proposalSubstitutes.createdAt))
    .limit(1);

  return row?.playerId ?? null;
}

/** Efface le tirage des équipes et les matchs programmés d'une session. */
async function clearDraw(tx: Transaction, proposalId: number): Promise<void> {
  const drawn = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.proposalId, proposalId));

  if (drawn.length === 0) return;

  // Aucun match validé ne peut exister ici : le balayage ne touche qu'aux
  // sessions à venir. On refuse quand même d'effacer un résultat acquis —
  // une erreur de filtre ailleurs ne doit pas réécrire l'histoire.
  const [validated] = await tx
    .select({ total: count() })
    .from(matches)
    .where(and(eq(matches.proposalId, proposalId), isNotNull(matches.validatedAt)));

  if (Number(validated?.total ?? 0) > 0) {
    throw new AppError(
      "RULE_VIOLATION",
      "Cette session a des matchs validés : sa composition ne peut plus changer.",
    );
  }

  // Ordre des suppressions explicite : les cascades de clés étrangères ne
  // sont pas garanties de la même façon sur MySQL et sur TiDB.
  const ids = drawn.map((team) => team.id);
  await tx.delete(matches).where(eq(matches.proposalId, proposalId));
  await tx.delete(teamMembers).where(inArray(teamMembers.teamId, ids));
  await tx.delete(teams).where(eq(teams.proposalId, proposalId));
}

/**
 * Recalcule compteurs et statut après le départ ou le remplacement d'un
 * joueur, et renvoie le nouveau statut.
 *
 * Le statut se **déduit** des inscrits, il ne se devine pas : c'est la même
 * règle qu'à l'inscription (CAL-007) et au paiement (CAL-011), lue à
 * l'envers. Une session qui perd un joueur redescend donc naturellement de
 * « session » à « réservation », puis à « proposition ».
 */
async function recomputeStatus(
  tx: Transaction,
  proposal: ProposalRow,
  seatFilled: boolean,
): Promise<ProposalRow["status"]> {
  const [row] = await tx
    .select({
      total: count(),
      paid: sql<number>`SUM(CASE WHEN ${proposalParticipants.hasPaid} THEN 1 ELSE 0 END)`,
    })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposal.id));

  const participantCount = Number(row?.total ?? 0);
  const paidCount = Number(row?.paid ?? 0);
  const full = participantCount >= proposal.minParticipants;
  const allPaid = full && paidCount >= participantCount;
  const status = !full ? "proposal" : allPaid ? "session" : "reservation";

  // Le délai de paiement appartient à la réservation entière, pas à une
  // place. Quand un remplaçant reprend une place déjà réglée, on ne peut donc
  // pas lui ouvrir un délai à lui seul : on prolonge celui de tout le monde,
  // sans jamais le raccourcir, et sans dépasser l'heure du coup d'envoi.
  let paymentDeadline = proposal.paymentDeadline;
  if (status === "proposal") {
    paymentDeadline = null;
  } else if (status === "reservation" && seatFilled) {
    const fresh = new Date(
      Math.min(
        Date.now() + PAYMENT_DEADLINE_HOURS * 3_600_000,
        proposal.startsAtUtc.getTime(),
      ),
    );
    paymentDeadline =
      paymentDeadline && paymentDeadline > fresh ? paymentDeadline : fresh;
  }

  await tx
    .update(proposals)
    .set({
      participantCount,
      paidCount,
      paymentComplete: allPaid,
      status,
      paymentDeadline,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  return status;
}

/**
 * Retire une place devenue inéligible, sous le verrou de la proposition.
 *
 * Renvoie `null` si la place n'a finalement pas à être retirée : la session a
 * pu changer d'état, ou le joueur redevenir éligible, entre le repérage et le
 * verrou.
 */
async function purgeSeat(
  tx: Transaction,
  proposalId: number,
  playerId: number,
): Promise<SeatPurge | null> {
  const proposal = await lockProposal(tx, proposalId);

  // Une session déjà jouée ne se corrige pas : ce qui s'est passé sur le
  // terrain s'est passé, et ses statistiques sont peut-être déjà saisies.
  if (!OPEN_STATUSES.includes(proposal.status as (typeof OPEN_STATUSES)[number])) {
    return null;
  }
  if (proposal.startsAtUtc.getTime() <= Date.now()) return null;

  const [player] = await tx
    .select({ division: players.division, accountType: players.accountType })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!player) return null;

  const reason: Reason | null =
    player.accountType === "referee"
      ? { kind: "referee" }
      : proposal.division !== null && player.division !== proposal.division
        ? { kind: "division", division: player.division }
        : null;

  if (!reason) return null;

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

  if (!seat) return null;

  const wasConfirmed = proposal.status === "session";
  const refundedUno = seat.hasPaid
    ? await refundSeat(tx, proposal, { playerId, paymentId: seat.paymentId })
    : 0;

  const replacement = await nextEligibleSubstitute(tx, proposal);

  if (replacement !== null) {
    // La place change de titulaire plutôt que de disparaître : le compteur
    // reste juste, l'historique dit qui a cédé sa place, et le remplaçant
    // hérite du poste dans l'équipe si le tirage est déjà fait.
    await tx
      .update(proposalParticipants)
      .set({
        playerId: replacement,
        hasPaid: false,
        paymentId: null,
        joinedAt: new Date(),
        replacedPlayerId: playerId,
      })
      .where(eq(proposalParticipants.id, seat.id));

    await tx
      .update(proposalSubstitutes)
      .set({
        status: "promoted",
        replacedPlayerId: playerId,
        promotedAt: new Date(),
      })
      .where(
        and(
          eq(proposalSubstitutes.proposalId, proposalId),
          eq(proposalSubstitutes.playerId, replacement),
        ),
      );

    const drawn = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.proposalId, proposalId));

    if (drawn.length > 0) {
      await tx
        .update(teamMembers)
        .set({ playerId: replacement })
        .where(
          and(
            inArray(
              teamMembers.teamId,
              drawn.map((team) => team.id),
            ),
            eq(teamMembers.playerId, playerId),
          ),
        );
    }
  } else {
    await tx
      .delete(proposalParticipants)
      .where(eq(proposalParticipants.id, seat.id));

    // Sans remplaçant, la composition n'est plus celle qui a été tirée : le
    // tirage est effacé plutôt que laissé faux. L'administration le refera
    // quand la session sera de nouveau complète.
    await clearDraw(tx, proposalId);
  }

  // Le joueur retiré ne reste pas non plus dans la file d'attente : il n'y
  // serait pas plus éligible qu'à la place qu'il vient de perdre.
  await tx
    .update(proposalSubstitutes)
    .set({ status: "withdrawn" })
    .where(
      and(
        eq(proposalSubstitutes.proposalId, proposalId),
        eq(proposalSubstitutes.playerId, playerId),
      ),
    );

  const status = await recomputeStatus(tx, proposal, replacement !== null);
  const lostConfirmation = wasConfirmed && status !== "session";

  await notifyPlayer(
    {
      playerId,
      eventKey: `proposal:${proposalId}:ineligible`,
      title: "Place libérée",
      body:
        reasonForPlayer(reason, proposal) +
        (refundedUno > 0 ? ` ${refundedUno} UNO vous ont été remboursés.` : ""),
    },
    tx,
  );

  if (replacement !== null) {
    await notifyPlayer(
      {
        playerId: replacement,
        eventKey: `proposal:${proposalId}:substitute-seat`,
        title: "Une place vous revient",
        body:
          `Vous entrez dans la session du ${proposal.localDate} à ${proposal.venueName}. ` +
          `Réglez votre place pour la confirmer.`,
      },
      tx,
    );
  }

  if (lostConfirmation) {
    const remaining = await tx
      .select({ playerId: proposalParticipants.playerId })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          ne(proposalParticipants.playerId, playerId),
        ),
      );

    for (const other of remaining) {
      await notifyPlayer(
        {
          playerId: other.playerId,
          eventKey: `proposal:${proposalId}:unconfirmed`,
          title: "Session incomplète",
          body:
            `La session du ${proposal.localDate} à ${proposal.venueName} n'est plus ` +
            `complète : une place s'est libérée et les inscriptions rouvrent.`,
        },
        tx,
      );
    }
  }

  await recordAdminEvent(
    {
      type: "participant.ineligible",
      body:
        reason.kind === "referee"
          ? `Un arbitre occupait une place de joueur — session du ${proposal.localDate} ` +
            `à ${proposal.venueName}. Place ` +
            (replacement !== null ? "reprise par un remplaçant." : "libérée.")
          : `Joueur passé en ${reason.division} sur une session ${proposal.division} — ` +
            `${proposal.localDate} à ${proposal.venueName}. Place ` +
            (replacement !== null ? "reprise par un remplaçant." : "libérée.") +
            (status === "proposal" ? " La session redevient une proposition." : ""),
      entityType: "proposal",
      entityId: proposalId,
      playerId,
      key: `proposal:${proposalId}:ineligible:${playerId}`,
    },
    tx,
  );

  return {
    proposalId,
    removedPlayerId: playerId,
    replacementPlayerId: replacement,
    refundedUno,
    reopened: status === "proposal",
    lostConfirmation,
  };
}

/** Places à corriger : sessions à venir dont un inscrit n'est plus éligible. */
async function findIneligibleSeats(
  tx: Transaction,
  options: { playerIds?: number[]; exceptProposalId?: number } = {},
): Promise<{ proposalId: number; playerId: number }[]> {
  const { playerIds, exceptProposalId } = options;
  if (playerIds && playerIds.length === 0) return [];

  const conditions = [
    inArray(proposals.status, [...OPEN_STATUSES]),
    gt(proposals.startsAtUtc, new Date()),
    // Un mode sans division (l'amical) n'exclut personne, mais le rôle
    // d'arbitre reste exclusif dans tous les modes.
    sql`(${players.accountType} = 'referee' OR (${proposals.division} IS NOT NULL AND ${proposals.division} <> ${players.division}))`,
  ];
  if (playerIds) {
    conditions.push(inArray(proposalParticipants.playerId, playerIds));
  }
  // La session dont la clôture provoque le balayage ne se balaie pas
  // elle-même : ses joueurs viennent d'y jouer, et ses matchs sont validés.
  // S'en remettre au filtre de statut ne suffirait pas — la clôture change la
  // division avant d'écrire « terminée », et une session peut être saisie
  // avant son heure de début.
  if (exceptProposalId !== undefined) {
    conditions.push(ne(proposalParticipants.proposalId, exceptProposalId));
  }

  return tx
    .select({
      proposalId: proposalParticipants.proposalId,
      playerId: proposalParticipants.playerId,
    })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(and(...conditions))
    // Les propositions sont verrouillées dans un ordre stable : deux clôtures
    // simultanées se sérialisent au lieu de se bloquer mutuellement.
    .orderBy(asc(proposalParticipants.proposalId), asc(proposalParticipants.playerId));
}

/**
 * Corrige les inscriptions de joueurs dont la division vient de changer.
 *
 * Appelée **dans la transaction** qui change la division : la promotion et le
 * retrait des sessions devenues interdites forment un seul fait. Les laisser
 * se séparer ouvrirait une fenêtre pendant laquelle un joueur est en D1 et
 * toujours inscrit en D2.
 */
export async function enforceDivisionEligibility(
  tx: Transaction,
  playerIds: number[],
  options: { exceptProposalId?: number } = {},
): Promise<SeatPurge[]> {
  const seats = await findIneligibleSeats(tx, { playerIds, ...options });
  const purges: SeatPurge[] = [];

  for (const seat of seats) {
    const purge = await purgeSeat(tx, seat.proposalId, seat.playerId);
    if (purge) purges.push(purge);
  }

  return purges;
}

/**
 * Balayage complet, pour la tâche d'entretien.
 *
 * Il rattrape ce qu'aucun évènement n'a corrigé : une division modifiée
 * directement en base, une correction manquée, ou des données antérieures à
 * cette règle. Chaque place est traitée dans sa propre transaction — un
 * échec sur une session n'empêche pas de corriger les autres.
 */
export async function sweepIneligibleSeats(): Promise<{
  removed: number;
  replaced: number;
  refundedUno: number;
  reopened: number;
}> {
  const seats = await db.transaction((tx) => findIneligibleSeats(tx));


  let removed = 0;
  let replaced = 0;
  let refundedUno = 0;
  let reopened = 0;

  for (const seat of seats) {
    try {
      const purge = await db.transaction((tx) =>
        purgeSeat(tx, seat.proposalId, seat.playerId),
      );
      if (!purge) continue;

      removed += 1;
      if (purge.replacementPlayerId !== null) replaced += 1;
      refundedUno += purge.refundedUno;
      if (purge.reopened) reopened += 1;
    } catch (error) {
      logger.error(
        { err: error, proposalId: seat.proposalId, playerId: seat.playerId },
        "place hors division non corrigée",
      );
    }
  }

  return { removed, replaced, refundedUno, reopened };
}
