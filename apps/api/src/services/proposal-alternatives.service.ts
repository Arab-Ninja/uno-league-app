import { and, asc, count, eq, gt, isNull, lte, ne } from "drizzle-orm";
import {
  AppError,
  IMMOVABLE_MODE_IDS,
  MOVE_WITHDRAWAL_HOURS,
  OFFERED_PAYMENT_METHOD,
  PROPOSAL_CUTOFF_HOUR,
  PROPOSAL_POLL,
  findSlot,
  gabarit,
  gameModeName,
  getGameMode,
  zonedTimeToUtc,
  type DecideProposalPollInput,
  type ErrorTemplate,
  type LeaveAfterMoveInput,
  type MoveProposalInput,
  type MoveWithdrawalView,
  type OpenProposalPollInput,
  type ProposalAlternativesView,
  type ProposalPollStatus,
  type ProposalPollView,
  type ProposalSlotChoice,
  type VoteProposalPollInput,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  payments,
  players,
  proposalParticipants,
  proposalPollOptions,
  proposalPollVotes,
  proposalPolls,
  proposals,
  type ProposalRow,
} from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { paymentAdapter } from "../payments/index.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { writeAudit } from "./audit.service.js";
import { refundSeat, vacateSeat } from "./eligibility.service.js";
import { notifyPlayer } from "./notifications.service.js";
import { buildSlotKey, lockProposal } from "./proposals.service.js";
import { requireBookableVenue } from "./venues.service.js";

/**
 * Les alternatives d'une séance (ALT-001).
 *
 * Le terrain se loue chez l'exploitant, et l'application ne voit pas ses
 * disponibilités. Le temps qu'une proposition se remplisse, son créneau peut
 * donc partir à quelqu'un d'autre. Plutôt que d'annuler, l'administration :
 *
 *  - **propose deux ou trois créneaux du même jour** qu'elle sait libres
 *    — une autre heure dans la même salle, ou la même heure ailleurs. Les
 *    inscrits votent ; à la clôture, la majorité s'applique d'elle-même, et
 *    une égalité revient à l'administration ;
 *  - ou **déplace directement** la séance, quand il n'y a qu'une solution.
 *
 * Dans les deux cas, tous les inscrits — et l'arbitre — sont prévenus. Celui
 * à qui le nouveau créneau ne convient pas peut libérer sa place pendant
 * `MOVE_WITHDRAWAL_HOURS` : réglée avant le déplacement, elle lui est
 * remboursée, en UNO ou sur sa carte s'il a payé en ligne.
 *
 * Un match personnalisé (PRIV-003) et un défi entre clubs ne sont pas
 * concernés : le premier appartient à son organisateur, le second à deux
 * clubs qui se sont mis d'accord.
 */

const OPEN_STATUSES: readonly string[] = ["proposal", "reservation", "session"];

type PollRow = typeof proposalPolls.$inferSelect;

/** Un créneau résolu : ce que la séance deviendra s'il est retenu. */
interface Target {
  venueId: string;
  venueName: string;
  timezone: string;
  slotStartHour: number;
  localTimeLabel: string;
  startsAtUtc: Date;
  slotKey: string | null;
}

interface Move {
  proposalId: number;
  before: { venueName: string; localTimeLabel: string };
  target: Target;
}

function isOpen(status: string): boolean {
  return OPEN_STATUSES.includes(status);
}

function assertMovable(proposal: ProposalRow, now: Date): void {
  if (IMMOVABLE_MODE_IDS.includes(proposal.modeId)) {
    throw new AppError(
      "RULE_VIOLATION",
      "Un match personnalisé ou un défi entre clubs ne change pas de créneau depuis la console.",
    );
  }
  if (!isOpen(proposal.status)) {
    throw new AppError(
      "RULE_VIOLATION",
      "Cette séance est terminée : elle ne se déplace plus.",
    );
  }
  if (proposal.startsAtUtc <= now) {
    throw new AppError(
      "RULE_VIOLATION",
      "La séance a commencé : elle ne change plus de créneau.",
    );
  }
}

/** Le vote se termine au plus tard à midi le jour J, et avant le coup d'envoi. */
function pollDeadlineLimit(proposal: ProposalRow): Date {
  const midi = zonedTimeToUtc(
    proposal.localDate,
    PROPOSAL_CUTOFF_HOUR,
    proposal.timezone,
  );
  return midi < proposal.startsAtUtc ? midi : proposal.startsAtUtc;
}

/** Jusqu'à quand un inscrit peut libérer sa place après un déplacement. */
export function withdrawalDeadline(
  proposal: Pick<ProposalRow, "movedAt" | "startsAtUtc">,
): Date | null {
  if (!proposal.movedAt) return null;
  return new Date(
    Math.min(
      proposal.movedAt.getTime() + MOVE_WITHDRAWAL_HOURS * 3_600_000,
      proposal.startsAtUtc.getTime(),
    ),
  );
}

/**
 * Vérifie un créneau du même jour et le résout : salle active et ouverte à ce
 * mode, heure valable pour sa durée, créneau à venir et différent de
 * l'actuel. Les mêmes contrôles qu'à la création d'une séance.
 */
async function resolveTarget(
  tx: Transaction,
  proposal: ProposalRow,
  choice: ProposalSlotChoice,
  now: Date,
): Promise<Target> {
  const mode = getGameMode(proposal.modeId);
  const slot = mode ? findSlot(mode, choice.slotStartHour) : undefined;
  if (!slot) {
    throw new AppError("VALIDATION_ERROR", "Ce créneau n'est pas disponible.", {
      slotStartHour: "Créneau invalide pour ce mode",
    });
  }

  const venue = await requireBookableVenue(tx, choice.venueId);
  if (venue.reservedModeId && venue.reservedModeId !== proposal.modeId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Ce terrain n'accueille pas ce mode de jeu.",
      { venueId: "Terrain réservé à un autre mode" },
    );
  }
  if (
    venue.slug === proposal.venueId &&
    slot.startHour === proposal.slotStartHour
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "C'est déjà le créneau de la séance.",
    );
  }

  const startsAtUtc = zonedTimeToUtc(
    proposal.localDate,
    slot.startHour,
    venue.timezone,
  );
  if (startsAtUtc <= now) {
    throw new AppError(
      "VALIDATION_ERROR",
      gabarit("{salle} à {heure} : ce créneau est déjà passé.", {
        salle: venue.name,
        heure: slot.label,
      }),
    );
  }

  return {
    venueId: venue.slug,
    venueName: venue.name,
    timezone: venue.timezone,
    slotStartHour: slot.startHour,
    localTimeLabel: slot.label,
    startsAtUtc,
    // Une séance privée ne prend pas de clé de créneau (PRIV-001) : elle n'en
    // prend pas davantage en changeant d'heure.
    slotKey:
      proposal.activeSlotKey === null
        ? null
        : buildSlotKey({
            venueId: venue.slug,
            localDate: proposal.localDate,
            slotStartHour: slot.startHour,
            modeId: proposal.modeId,
          }),
  };
}

/** Une autre séance du même mode occupe-t-elle déjà ce créneau ? */
async function slotTaken(
  executor: Executor,
  slotKey: string | null,
  proposalId: number,
): Promise<boolean> {
  if (slotKey === null) return false;
  const [row] = await executor
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(eq(proposals.activeSlotKey, slotKey), ne(proposals.id, proposalId)),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Déplace la séance, sous le verrou de l'appelant.
 *
 * Le terrain du nouveau créneau reste à réserver (VENUE-001) : la
 * déclaration portait sur l'ancien. Une échéance de paiement plus tardive que
 * le nouveau coup d'envoi y est ramenée. Un vote encore ouvert sur cette
 * séance est clos — il portait sur l'ancien créneau.
 */
async function applyMove(
  tx: Transaction,
  proposal: ProposalRow,
  target: Target,
  now: Date,
  actorUserId: number | null,
): Promise<Move> {
  if (await slotTaken(tx, target.slotKey, proposal.id)) {
    throw new AppError(
      "CONFLICT",
      "Une autre séance occupe déjà ce terrain à cette heure.",
    );
  }

  const paymentDeadline =
    proposal.paymentDeadline && proposal.paymentDeadline > target.startsAtUtc
      ? target.startsAtUtc
      : proposal.paymentDeadline;

  try {
    await tx
      .update(proposals)
      .set({
        venueId: target.venueId,
        venueName: target.venueName,
        timezone: target.timezone,
        slotStartHour: target.slotStartHour,
        localTimeLabel: target.localTimeLabel,
        startsAtUtc: target.startsAtUtc,
        activeSlotKey: target.slotKey,
        venueBookedAt: null,
        movedAt: now,
        paymentDeadline,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "Une autre séance occupe déjà ce terrain à cette heure.",
      );
    }
    throw error;
  }

  await tx
    .update(proposalPolls)
    .set({ status: "closed", activeProposalId: null, updatedAt: now })
    .where(eq(proposalPolls.activeProposalId, proposal.id));

  await writeAudit(tx, {
    actorUserId,
    action: "proposal.move",
    entityType: "proposal",
    entityId: proposal.id,
    before: {
      venueId: proposal.venueId,
      localTimeLabel: proposal.localTimeLabel,
    },
    after: { venueId: target.venueId, localTimeLabel: target.localTimeLabel },
  });

  return {
    proposalId: proposal.id,
    before: {
      venueName: proposal.venueName,
      localTimeLabel: proposal.localTimeLabel,
    },
    target,
  };
}

/**
 * Prévient tout le monde d'un déplacement — après le commit, sur `db`.
 *
 * Les inscrits apprennent le nouveau créneau et jusqu'à quand ils peuvent
 * libérer leur place ; l'arbitre, le nouveau créneau seulement ; et
 * l'administration, comment la décision a été prise.
 */
async function announceMove(move: Move, origin: string): Promise<void> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, move.proposalId))
    .limit(1);
  if (!proposal) return;

  const { before, target } = move;
  const deadline = withdrawalDeadline(proposal);
  const echeance = deadline
    ? { instant: deadline.toISOString(), fuseau: proposal.timezone }
    : null;
  const corps = gabarit(
    "{jour} : la séance se jouera à {salle}, {heure}, au lieu de {salleAvant}, {heureAvant}.",
    {
      jour: { jour: proposal.localDate },
      salle: target.venueName,
      heure: target.localTimeLabel,
      salleAvant: before.venueName,
      heureAvant: before.localTimeLabel,
    },
  );
  const key =
    `proposal:${proposal.id}:moved:${target.venueId}:${target.slotStartHour}` +
    `:${proposal.movedAt?.getTime() ?? 0}`;
  const url = `/sessions/${proposal.id}`;

  const seats = await db
    .select({
      playerId: proposalParticipants.playerId,
      hasPaid: proposalParticipants.hasPaid,
    })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposal.id));

  for (const seat of seats) {
    const suite: ErrorTemplate[] = echeance
      ? [
          seat.hasPaid
            ? gabarit(
                "Ce créneau ne vous convient pas ? Libérez votre place depuis la séance avant le {echeance} : elle vous sera remboursée.",
                { echeance },
              )
            : gabarit(
                "Ce créneau ne vous convient pas ? Libérez votre place depuis la séance avant le {echeance}.",
                { echeance },
              ),
        ]
      : [];
    await notifyPlayer(
      {
        playerId: seat.playerId,
        eventKey: key,
        title: gabarit("Séance déplacée"),
        body: [corps, ...suite],
        url,
      },
      db,
    );
  }

  if (
    proposal.refereePlayerId !== null &&
    !seats.some((seat) => seat.playerId === proposal.refereePlayerId)
  ) {
    await notifyPlayer(
      {
        playerId: proposal.refereePlayerId,
        eventKey: key,
        title: gabarit("Séance déplacée"),
        body: corps,
        url,
      },
      db,
    );
  }

  await recordAdminEvent(
    {
      type: "proposal.moved",
      body:
        `${gameModeName(proposal.modeId)} du ${proposal.localDate} : ` +
        `${before.venueName} ${before.localTimeLabel} → ` +
        `${target.venueName} ${target.localTimeLabel}, ${origin}`,
      entityType: "proposal",
      entityId: proposal.id,
      key,
    },
    db,
  );
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Le décompte d'un vote. Seules comptent les voix des inscrits **actuels** :
 * un joueur parti entre-temps n'a plus son mot à dire sur une séance où il
 * ne viendra pas.
 */
async function tally(
  executor: Executor,
  poll: PollRow,
): Promise<{
  options: (typeof proposalPollOptions.$inferSelect & { votes: number })[];
  noneVotes: number;
  participants: number;
}> {
  const options = await executor
    .select()
    .from(proposalPollOptions)
    .where(eq(proposalPollOptions.pollId, poll.id))
    .orderBy(asc(proposalPollOptions.position));

  const rows = await executor
    .select({ optionId: proposalPollVotes.optionId, total: count() })
    .from(proposalPollVotes)
    .innerJoin(
      proposalParticipants,
      and(
        eq(proposalParticipants.proposalId, poll.proposalId),
        eq(proposalParticipants.playerId, proposalPollVotes.playerId),
      ),
    )
    .where(eq(proposalPollVotes.pollId, poll.id))
    .groupBy(proposalPollVotes.optionId);

  const votesOf = (optionId: number | null) =>
    Number(rows.find((row) => row.optionId === optionId)?.total ?? 0);

  const [seats] = await executor
    .select({ total: count() })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, poll.proposalId));

  return {
    options: options.map((option) => ({
      ...option,
      votes: votesOf(option.id),
    })),
    noneVotes: votesOf(null),
    participants: Number(seats?.total ?? 0),
  };
}

async function pollView(
  executor: Executor,
  poll: PollRow,
  viewerPlayerId?: number,
): Promise<ProposalPollView> {
  const counted = await tally(executor, poll);

  let myChoice: number | null | undefined;
  if (viewerPlayerId !== undefined) {
    const [vote] = await executor
      .select({ optionId: proposalPollVotes.optionId })
      .from(proposalPollVotes)
      .where(
        and(
          eq(proposalPollVotes.pollId, poll.id),
          eq(proposalPollVotes.playerId, viewerPlayerId),
        ),
      )
      .limit(1);
    myChoice = vote ? vote.optionId : undefined;
  }

  return {
    id: poll.id,
    proposalId: poll.proposalId,
    status: poll.status as ProposalPollStatus,
    reason: poll.reason,
    closesAt: poll.closesAt.toISOString(),
    options: counted.options.map((option) => ({
      id: option.id,
      venueId: option.venueId,
      venueName: option.venueName,
      slotStartHour: option.slotStartHour,
      localTimeLabel: option.localTimeLabel,
      votes: option.votes,
    })),
    noneVotes: counted.noneVotes,
    participants: counted.participants,
    winningOptionId: poll.winningOptionId,
    ...(myChoice !== undefined ? { myChoice } : {}),
  };
}

/** Le vote en cours ou à trancher d'une séance, vu par l'administration. */
export async function activePollView(
  proposalId: number,
): Promise<ProposalPollView | null> {
  const [poll] = await db
    .select()
    .from(proposalPolls)
    .where(eq(proposalPolls.activeProposalId, proposalId))
    .limit(1);
  return poll ? pollView(db, poll) : null;
}

/**
 * Ce que l'écran de la séance montre à un inscrit : le vote en cours, et ce
 * qu'il peut faire de sa place après un déplacement. Rien pour qui n'est pas
 * inscrit — le vote appartient aux inscrits, et une séance privée ne se
 * raconte pas à n'importe qui.
 */
export async function alternativesFor(
  viewer: { playerId: number },
  proposalId: number,
  now = new Date(),
): Promise<ProposalAlternativesView> {
  const empty: ProposalAlternativesView = { poll: null, withdrawal: null };

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal || !isOpen(proposal.status)) return empty;

  const [seat] = await db
    .select({
      hasPaid: proposalParticipants.hasPaid,
      paymentId: proposalParticipants.paymentId,
      joinedAt: proposalParticipants.joinedAt,
    })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, viewer.playerId),
      ),
    )
    .limit(1);
  if (!seat) return empty;

  const [poll] = await db
    .select()
    .from(proposalPolls)
    .where(eq(proposalPolls.activeProposalId, proposalId))
    .limit(1);

  let withdrawal: MoveWithdrawalView | null = null;
  const deadline = withdrawalDeadline(proposal);
  if (
    deadline &&
    proposal.movedAt &&
    now < deadline &&
    seat.joinedAt < proposal.movedAt
  ) {
    const [payment] =
      seat.hasPaid && seat.paymentId !== null
        ? await db
            .select()
            .from(payments)
            .where(eq(payments.id, seat.paymentId))
            .limit(1)
        : [];
    const paidAfter =
      payment?.paidAt !== null &&
      payment?.paidAt !== undefined &&
      payment.paidAt >= proposal.movedAt;

    if (!paidAfter) {
      withdrawal = {
        deadline: deadline.toISOString(),
        paid: seat.hasPaid,
        refundMethods: !seat.hasPaid
          ? []
          : payment?.method === OFFERED_PAYMENT_METHOD
            ? []
            : paidOnline(payment)
              ? ["uno", "eur"]
              : ["uno"],
        amountUno: proposal.priceUno,
        amountEurCents: payment?.amountEurCents ?? proposal.priceEur * 100,
      };
    }
  }

  return {
    poll: poll ? await pollView(db, poll, viewer.playerId) : null,
    withdrawal,
  };
}

function paidOnline(
  payment: typeof payments.$inferSelect | undefined,
): payment is typeof payments.$inferSelect & { providerIntentId: string } {
  return (
    payment !== undefined &&
    payment.method !== "uno" &&
    payment.method !== OFFERED_PAYMENT_METHOD &&
    payment.providerIntentId !== null
  );
}

async function participantIds(proposalId: number): Promise<number[]> {
  const rows = await db
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));
  return rows.map((row) => row.playerId);
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

/** Ouvre un vote sur deux ou trois créneaux du même jour. */
export async function openPoll(
  actor: { userId: number },
  input: OpenProposalPollInput,
  now = new Date(),
): Promise<ProposalPollView> {
  const closesAt = new Date(input.closesAt);
  const reason = input.reason?.trim() ? input.reason.trim() : null;

  const { proposal, pollId } = await db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    assertMovable(proposal, now);

    if (
      closesAt.getTime() <
      now.getTime() + PROPOSAL_POLL.minDurationMinutes * 60_000
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        gabarit("Le vote doit durer au moins {minutes} minutes.", {
          minutes: PROPOSAL_POLL.minDurationMinutes,
        }),
      );
    }
    const limit = pollDeadlineLimit(proposal);
    if (closesAt > limit) {
      throw new AppError(
        "VALIDATION_ERROR",
        gabarit("Le vote doit se terminer au plus tard le {echeance}.", {
          echeance: { instant: limit.toISOString(), fuseau: proposal.timezone },
        }),
      );
    }

    const targets: Target[] = [];
    for (const choice of input.options) {
      const target = await resolveTarget(tx, proposal, choice, now);
      if (
        targets.some(
          (other) =>
            other.venueId === target.venueId &&
            other.slotStartHour === target.slotStartHour,
        )
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Le même créneau est proposé deux fois.",
        );
      }
      if (target.startsAtUtc <= closesAt) {
        throw new AppError(
          "VALIDATION_ERROR",
          gabarit("{salle} à {heure} commence avant la fin du vote.", {
            salle: target.venueName,
            heure: target.localTimeLabel,
          }),
        );
      }
      if (await slotTaken(tx, target.slotKey, proposal.id)) {
        throw new AppError(
          "CONFLICT",
          gabarit(
            "{salle} à {heure} : une autre séance occupe déjà ce terrain.",
            {
              salle: target.venueName,
              heure: target.localTimeLabel,
            },
          ),
        );
      }
      targets.push(target);
    }

    let pollId: number;
    try {
      const inserted = await tx.insert(proposalPolls).values({
        proposalId: proposal.id,
        status: "open",
        activeProposalId: proposal.id,
        reason,
        closesAt,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
      pollId = Number(inserted[0].insertId);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      throw new AppError(
        "CONFLICT",
        "Un vote est déjà en cours pour cette séance.",
      );
    }

    await tx.insert(proposalPollOptions).values(
      targets.map((target, index) => ({
        pollId,
        position: index + 1,
        venueId: target.venueId,
        venueName: target.venueName,
        slotStartHour: target.slotStartHour,
        localTimeLabel: target.localTimeLabel,
      })),
    );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.poll.open",
      entityType: "proposal",
      entityId: proposal.id,
      after: {
        pollId,
        closesAt: closesAt.toISOString(),
        options: targets.map(
          (target) => `${target.venueId} ${target.localTimeLabel}`,
        ),
      },
    });

    return { proposal, pollId };
  });

  for (const playerId of await participantIds(proposal.id)) {
    await notifyPlayer(
      {
        playerId,
        eventKey: `proposal:${proposal.id}:poll:${pollId}`,
        title: gabarit("Votez pour un autre créneau"),
        body: [
          gabarit(
            "{salle}, le {jour} à {heure} : la séance doit changer de créneau. Votez avant le {echeance}.",
            {
              salle: proposal.venueName,
              jour: { jour: proposal.localDate },
              heure: proposal.localTimeLabel,
              echeance: {
                instant: closesAt.toISOString(),
                fuseau: proposal.timezone,
              },
            },
          ),
          // Le mot de l'administration, tel qu'elle l'a écrit.
          ...(reason ? [reason] : []),
        ],
        url: `/sessions/${proposal.id}`,
      },
      db,
    );
  }

  const [poll] = await db
    .select()
    .from(proposalPolls)
    .where(eq(proposalPolls.id, pollId))
    .limit(1);
  return pollView(db, poll!);
}

/** La voix d'un inscrit ; il peut en changer jusqu'à la clôture. */
export async function votePoll(
  actor: { playerId: number },
  input: VoteProposalPollInput,
  now = new Date(),
): Promise<ProposalPollView> {
  return db.transaction(async (tx) => {
    const [poll] = await tx
      .select()
      .from(proposalPolls)
      .where(eq(proposalPolls.id, input.pollId))
      .limit(1)
      .for("update");
    if (!poll) {
      throw new AppError("NOT_FOUND", "Ce vote est introuvable.");
    }
    if (poll.status !== "open" || poll.closesAt <= now) {
      throw new AppError("RULE_VIOLATION", "Ce vote est clos.");
    }

    const [seat] = await tx
      .select({ id: proposalParticipants.id })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, poll.proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);
    if (!seat) {
      throw new AppError(
        "FORBIDDEN",
        "Seuls les inscrits de la séance votent.",
      );
    }

    if (input.optionId !== null) {
      const [option] = await tx
        .select({ id: proposalPollOptions.id })
        .from(proposalPollOptions)
        .where(
          and(
            eq(proposalPollOptions.id, input.optionId),
            eq(proposalPollOptions.pollId, poll.id),
          ),
        )
        .limit(1);
      if (!option) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Ce choix ne fait pas partie du vote.",
        );
      }
    }

    await tx
      .insert(proposalPollVotes)
      .values({
        pollId: poll.id,
        playerId: actor.playerId,
        optionId: input.optionId,
        createdAt: now,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: { optionId: input.optionId, updatedAt: now },
      });

    return pollView(tx, poll, actor.playerId);
  });
}

type Settlement =
  | { kind: "applied"; move: Move; votes: number; participants: number }
  | { kind: "tie"; proposal: ProposalRow; body: string }
  | { kind: "closed" };

/**
 * Tranche un vote arrivé à échéance.
 *
 * Le créneau qui a le plus de voix s'applique. Pas de majorité — égalité en
 * tête, ou aucune voix pour un créneau — ou créneau retenu devenu
 * impossible : le vote passe « à trancher », et l'administration est
 * prévenue. Les voix « aucun ne me convient » se comptent sans peser : le
 * créneau d'origine n'existe plus, il faut bien en choisir un.
 */
async function settlePoll(
  pollId: number,
  now: Date,
): Promise<Settlement | null> {
  const [head] = await db
    .select({ proposalId: proposalPolls.proposalId })
    .from(proposalPolls)
    .where(eq(proposalPolls.id, pollId))
    .limit(1);
  if (!head) return null;

  const settled = await db.transaction(
    async (tx): Promise<Settlement | null> => {
      // Toujours la séance d'abord, puis le vote : le même ordre partout.
      const proposal = await lockProposal(tx, head.proposalId);
      const [poll] = await tx
        .select()
        .from(proposalPolls)
        .where(eq(proposalPolls.id, pollId))
        .limit(1)
        .for("update");
      if (!poll || poll.status !== "open") return null;

      if (!isOpen(proposal.status) || proposal.startsAtUtc <= now) {
        await tx
          .update(proposalPolls)
          .set({ status: "closed", activeProposalId: null, updatedAt: now })
          .where(eq(proposalPolls.id, poll.id));
        return { kind: "closed" };
      }

      const counted = await tally(tx, poll);
      const best = Math.max(
        0,
        ...counted.options.map((option) => option.votes),
      );
      const leaders = counted.options.filter((option) => option.votes === best);
      const seance =
        `${gameModeName(proposal.modeId)} du ${proposal.localDate}, ` +
        `${proposal.venueName} ${proposal.localTimeLabel}`;

      const toDecide = async (body: string): Promise<Settlement> => {
        await tx
          .update(proposalPolls)
          .set({ status: "tie", updatedAt: now })
          .where(eq(proposalPolls.id, poll.id));
        return { kind: "tie", proposal, body };
      };

      if (best === 0) {
        return toDecide(
          `${seance} — aucune voix pour un créneau. À trancher dans Sessions.`,
        );
      }
      if (leaders.length > 1) {
        return toDecide(
          `${seance} — égalité entre ` +
            leaders
              .map((option) => `${option.venueName} ${option.localTimeLabel}`)
              .join(" et ") +
            ` (${best} voix chacun). À trancher dans Sessions.`,
        );
      }

      const winner = leaders[0]!;
      let target: Target;
      try {
        target = await resolveTarget(tx, proposal, winner, now);
        if (await slotTaken(tx, target.slotKey, proposal.id)) {
          throw new AppError(
            "CONFLICT",
            "Une autre séance occupe déjà ce terrain à cette heure.",
          );
        }
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        return toDecide(
          `${seance} — le créneau choisi (${winner.venueName} ` +
            `${winner.localTimeLabel}) n'est plus possible. À trancher dans Sessions.`,
        );
      }

      const move = await applyMove(tx, proposal, target, now, null);
      await tx
        .update(proposalPolls)
        .set({
          status: "applied",
          activeProposalId: null,
          winningOptionId: winner.id,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(proposalPolls.id, poll.id));

      return {
        kind: "applied",
        move,
        votes: best,
        participants: counted.participants,
      };
    },
  );

  if (settled?.kind === "applied") {
    await announceMove(
      settled.move,
      `choisi par vote (${settled.votes} voix sur ${settled.participants} inscrits).`,
    );
  } else if (settled?.kind === "tie") {
    await recordAdminEvent(
      {
        type: "proposal.poll",
        body: settled.body,
        entityType: "proposal",
        entityId: settled.proposal.id,
        key: `proposal-poll:${pollId}:tie`,
      },
      db,
    );
  }
  return settled;
}

/**
 * Rappel aux inscrits qui n'ont pas voté, `reminderHoursBefore` heures avant
 * la clôture. Un vote trop court n'en a pas : le rappel suivrait l'annonce de
 * quelques minutes.
 */
async function remindVoters(now: Date): Promise<number> {
  const soon = new Date(
    now.getTime() + PROPOSAL_POLL.reminderHoursBefore * 3_600_000,
  );
  const due = await db
    .select({ poll: proposalPolls, proposal: proposals })
    .from(proposalPolls)
    .innerJoin(proposals, eq(proposals.id, proposalPolls.proposalId))
    .where(
      and(
        eq(proposalPolls.status, "open"),
        isNull(proposalPolls.remindedAt),
        gt(proposalPolls.closesAt, now),
        lte(proposalPolls.closesAt, soon),
      ),
    );

  let reminded = 0;
  for (const { poll, proposal } of due) {
    await db
      .update(proposalPolls)
      .set({ remindedAt: now, updatedAt: now })
      .where(eq(proposalPolls.id, poll.id));

    const duration = poll.closesAt.getTime() - poll.createdAt.getTime();
    if (duration < PROPOSAL_POLL.reminderMinDurationHours * 3_600_000) continue;

    const voters = await db
      .select({ playerId: proposalPollVotes.playerId })
      .from(proposalPollVotes)
      .where(eq(proposalPollVotes.pollId, poll.id));
    const voted = new Set(voters.map((row) => row.playerId));

    for (const playerId of await participantIds(proposal.id)) {
      if (voted.has(playerId)) continue;
      await notifyPlayer(
        {
          playerId,
          eventKey: `proposal:${proposal.id}:poll:${poll.id}:reminder`,
          title: gabarit("Vote en cours"),
          body: gabarit(
            "{salle}, le {jour} à {heure} : vous n'avez pas encore choisi le nouveau créneau. Le vote se termine le {echeance}.",
            {
              salle: proposal.venueName,
              jour: { jour: proposal.localDate },
              heure: proposal.localTimeLabel,
              echeance: {
                instant: poll.closesAt.toISOString(),
                fuseau: proposal.timezone,
              },
            },
          ),
          url: `/sessions/${proposal.id}`,
        },
        db,
      );
      reminded++;
    }
  }
  return reminded;
}

/**
 * Entretien périodique : tranche les votes échus, rappelle les retardataires.
 */
export async function closeDuePolls(now = new Date()): Promise<{
  applied: number;
  toDecide: number;
  reminded: number;
}> {
  const due = await db
    .select({ id: proposalPolls.id })
    .from(proposalPolls)
    .where(
      and(eq(proposalPolls.status, "open"), lte(proposalPolls.closesAt, now)),
    )
    .orderBy(asc(proposalPolls.closesAt));

  let applied = 0;
  let toDecide = 0;
  for (const { id } of due) {
    try {
      const settled = await settlePoll(id, now);
      if (settled?.kind === "applied") applied++;
      if (settled?.kind === "tie") toDecide++;
    } catch (error) {
      // Un vote en échec ne doit pas bloquer les suivants : la prochaine
      // passe le reprendra.
      logger.error(
        { err: error, pollId: id },
        "vote d'alternative non tranché",
      );
    }
  }

  const reminded = await remindVoters(now);
  return { applied, toDecide, reminded };
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

/** L'administration retient un créneau : égalité, ou décision anticipée. */
export async function decidePoll(
  actor: { userId: number },
  input: DecideProposalPollInput,
  now = new Date(),
): Promise<void> {
  const [head] = await db
    .select({ proposalId: proposalPolls.proposalId })
    .from(proposalPolls)
    .where(eq(proposalPolls.id, input.pollId))
    .limit(1);
  if (!head) throw new AppError("NOT_FOUND", "Ce vote est introuvable.");

  const move = await db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, head.proposalId);
    const [poll] = await tx
      .select()
      .from(proposalPolls)
      .where(eq(proposalPolls.id, input.pollId))
      .limit(1)
      .for("update");
    if (!poll || (poll.status !== "open" && poll.status !== "tie")) {
      throw new AppError("RULE_VIOLATION", "Ce vote est clos.");
    }
    assertMovable(proposal, now);

    const [option] = await tx
      .select()
      .from(proposalPollOptions)
      .where(
        and(
          eq(proposalPollOptions.id, input.optionId),
          eq(proposalPollOptions.pollId, poll.id),
        ),
      )
      .limit(1);
    if (!option) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Ce choix ne fait pas partie du vote.",
      );
    }

    const target = await resolveTarget(tx, proposal, option, now);
    const move = await applyMove(tx, proposal, target, now, actor.userId);
    await tx
      .update(proposalPolls)
      .set({
        status: "applied",
        activeProposalId: null,
        winningOptionId: option.id,
        decidedAt: now,
        updatedAt: now,
      })
      .where(eq(proposalPolls.id, poll.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.poll.decide",
      entityType: "proposal",
      entityId: proposal.id,
      after: { pollId: poll.id, optionId: option.id },
    });
    return move;
  });

  await announceMove(move, "tranché par l'administration.");
}

/** Clôt un vote sans rien déplacer — le créneau d'origine s'est libéré, par exemple. */
export async function cancelPoll(
  actor: { userId: number },
  pollId: number,
  now = new Date(),
): Promise<void> {
  const [head] = await db
    .select({ proposalId: proposalPolls.proposalId })
    .from(proposalPolls)
    .where(eq(proposalPolls.id, pollId))
    .limit(1);
  if (!head) throw new AppError("NOT_FOUND", "Ce vote est introuvable.");

  const proposal = await db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, head.proposalId);
    const [poll] = await tx
      .select()
      .from(proposalPolls)
      .where(eq(proposalPolls.id, pollId))
      .limit(1)
      .for("update");
    if (!poll || (poll.status !== "open" && poll.status !== "tie")) {
      throw new AppError("RULE_VIOLATION", "Ce vote est clos.");
    }
    await tx
      .update(proposalPolls)
      .set({ status: "closed", activeProposalId: null, updatedAt: now })
      .where(eq(proposalPolls.id, poll.id));
    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.poll.cancel",
      entityType: "proposal",
      entityId: proposal.id,
      after: { pollId: poll.id },
    });
    return proposal;
  });

  for (const playerId of await participantIds(proposal.id)) {
    await notifyPlayer(
      {
        playerId,
        eventKey: `proposal:${proposal.id}:poll:${pollId}:cancelled`,
        title: gabarit("Vote annulé"),
        body: gabarit(
          "{salle}, le {jour} à {heure} : le vote pour un autre créneau est annulé.",
          {
            salle: proposal.venueName,
            jour: { jour: proposal.localDate },
            heure: proposal.localTimeLabel,
          },
        ),
        url: `/sessions/${proposal.id}`,
      },
      db,
    );
  }
}

/** Déplacement direct, sans vote : il n'y avait qu'une solution. */
export async function moveProposal(
  actor: { userId: number },
  input: MoveProposalInput,
  now = new Date(),
): Promise<{ venueName: string; localTimeLabel: string }> {
  const move = await db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    assertMovable(proposal, now);
    const target = await resolveTarget(tx, proposal, input, now);
    return applyMove(tx, proposal, target, now, actor.userId);
  });

  await announceMove(move, "déplacée par l'administration.");
  return {
    venueName: move.target.venueName,
    localTimeLabel: move.target.localTimeLabel,
  };
}

// ---------------------------------------------------------------------------
// Libérer sa place après un déplacement
// ---------------------------------------------------------------------------

function euros(cents: number): string {
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/**
 * Un inscrit à qui le nouveau créneau ne convient pas libère sa place
 * (ALT-001).
 *
 * Possible pendant `MOVE_WITHDRAWAL_HOURS` après le déplacement, quel que
 * soit le statut — y compris d'une réservation ou d'une séance confirmée,
 * que les règles ordinaires ne laissent pas quitter. Seulement pour qui
 * s'était engagé **avant** : s'inscrire ou payer après, c'est avoir accepté
 * le nouveau créneau.
 *
 * Une place réglée est remboursée. En UNO, tout de suite. En euros, pour un
 * paiement en ligne : la place est libérée et le paiement marqué remboursé
 * dans la même transaction, puis le remboursement est demandé au prestataire.
 * S'il échoue — ou si aucun prestataire n'est configuré —, l'administration
 * reçoit de quoi le faire à la main.
 */
export async function leaveAfterMove(
  actor: { playerId: number },
  input: LeaveAfterMoveInput,
  now = new Date(),
): Promise<{ refundedUno: number; refundedEurCents: number }> {
  const outcome = await db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    const deadline = withdrawalDeadline(proposal);
    if (
      !deadline ||
      !proposal.movedAt ||
      !isOpen(proposal.status) ||
      now >= deadline
    ) {
      throw new AppError(
        "RULE_VIOLATION",
        "Le délai pour libérer votre place après le déplacement est passé.",
      );
    }

    const [seat] = await tx
      .select({
        id: proposalParticipants.id,
        hasPaid: proposalParticipants.hasPaid,
        paymentId: proposalParticipants.paymentId,
        joinedAt: proposalParticipants.joinedAt,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposal.id),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);
    if (!seat) throw new AppError("NOT_PARTICIPANT");
    if (seat.joinedAt >= proposal.movedAt) {
      throw new AppError(
        "RULE_VIOLATION",
        "Votre inscription date d'après le déplacement : les règles habituelles s'appliquent.",
      );
    }

    const [payment] =
      seat.hasPaid && seat.paymentId !== null
        ? await tx
            .select()
            .from(payments)
            .where(eq(payments.id, seat.paymentId))
            .limit(1)
        : [];
    if (payment?.paidAt && payment.paidAt >= proposal.movedAt) {
      throw new AppError(
        "RULE_VIOLATION",
        "Votre place a été réglée après le déplacement : les règles habituelles s'appliquent.",
      );
    }

    let refundedUno = 0;
    let euro: {
      paymentId: number;
      providerIntentId: string;
      amountEurCents: number;
    } | null = null;

    if (seat.hasPaid) {
      if (input.refund === "eur") {
        if (!paidOnline(payment)) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Cette place n'a pas été réglée en ligne : elle se rembourse en UNO.",
          );
        }
        await tx
          .update(payments)
          .set({ status: "refunded", updatedAt: now })
          .where(and(eq(payments.id, payment.id), eq(payments.status, "paid")));
        euro = {
          paymentId: payment.id,
          providerIntentId: payment.providerIntentId,
          amountEurCents: payment.amountEurCents,
        };
      } else {
        refundedUno = await refundSeat(tx, proposal, {
          playerId: actor.playerId,
          paymentId: seat.paymentId,
        });
      }
    }

    await vacateSeat(tx, proposal, { id: seat.id, playerId: actor.playerId });
    return { proposal, refundedUno, euro, hasPaid: seat.hasPaid };
  });

  const { proposal, refundedUno, euro } = outcome;

  let euroDone: boolean | null = null;
  if (euro) {
    try {
      await paymentAdapter().refund({
        providerIntentId: euro.providerIntentId,
        amountEurCents: euro.amountEurCents,
        idempotencyKey: `uno-refund-move-${euro.paymentId}`,
      });
      euroDone = true;
    } catch (error) {
      // Ni la référence du paiement ni le message du prestataire au journal
      // (SEC-007) : l'identifiant interne suffit à retrouver le dossier.
      logger.warn(
        {
          paymentId: euro.paymentId,
          kind: error instanceof Error ? error.name : "inconnu",
        },
        "remboursement en ligne non abouti : à faire à la main",
      );
      euroDone = false;
    }
  }

  const seance = {
    jour: { jour: proposal.localDate },
    salle: proposal.venueName,
  };
  await notifyPlayer(
    {
      playerId: actor.playerId,
      eventKey: `proposal:${proposal.id}:left-after-move:${proposal.movedAt?.getTime() ?? 0}`,
      title: gabarit("Place libérée"),
      body: [
        gabarit(
          "Vous avez libéré votre place pour la séance du {jour} à {salle}.",
          seance,
        ),
        ...(refundedUno > 0
          ? [
              gabarit("{montant} UNO vous ont été remboursés.", {
                montant: refundedUno,
              }),
            ]
          : []),
        ...(euro && euroDone
          ? [
              gabarit(
                "Le remboursement de {montant} part vers votre moyen de paiement : comptez quelques jours.",
                { montant: euros(euro.amountEurCents) },
              ),
            ]
          : []),
        ...(euro && euroDone === false
          ? [
              gabarit(
                "Votre remboursement de {montant} sera fait par l'organisation dans les prochains jours.",
                { montant: euros(euro.amountEurCents) },
              ),
            ]
          : []),
      ],
      url: `/sessions/${proposal.id}`,
    },
    db,
  );

  const [player] = await db
    .select({ displayName: players.displayName })
    .from(players)
    .where(eq(players.id, actor.playerId))
    .limit(1);
  const remboursement = euro
    ? euroDone
      ? `${euros(euro.amountEurCents)} remboursés par Stripe.`
      : `REMBOURSEMENT DE ${euros(euro.amountEurCents)} À FAIRE dans Stripe (paiement n° ${euro.paymentId}).`
    : refundedUno > 0
      ? `${refundedUno} UNO remboursés.`
      : "Place non réglée, rien à rembourser.";

  await recordAdminEvent(
    {
      type: "payment.refund",
      body:
        `${player?.displayName ?? "Un joueur"} libère sa place après le déplacement — ` +
        `${gameModeName(proposal.modeId)} du ${proposal.localDate}, ` +
        `${proposal.venueName} ${proposal.localTimeLabel}. ${remboursement}`,
      entityType: "proposal",
      entityId: proposal.id,
      playerId: actor.playerId,
      key: `proposal:${proposal.id}:left-after-move:${actor.playerId}:${proposal.movedAt?.getTime() ?? 0}`,
    },
    db,
  );

  return {
    refundedUno,
    refundedEurCents: euro ? euro.amountEurCents : 0,
  };
}
