import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  AppError,
  DEFAULT_REWARD_POLICY,
  MIN_PROPOSAL_LEAD_DAYS,
  REWARD_KIND_LABELS,
  REWARD_POLICY_VERSION,
  addDaysIso,
  diffDaysIso,
  eurToUno,
  findSlot,
  getGameMode,
  getVenue,
  requireSchedulableMode,
  todayIso,
  zonedTimeToUtc,
  type CreateProposalInput,
  type Division,
  type GameMode,
  type ListProposalsInput,
  type ProposalDetail,
  type ProposalSummary,
  type RewardKind,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  players,
  proposalParticipants,
  proposals,
  type ProposalRow,
} from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { writeAudit } from "./audit.service.js";

/**
 * Cycle de vie des propositions (CDC §8).
 *
 *   proposition ──(quota atteint)──▶ réservation ──(tous payés)──▶ session
 *
 * Toutes les transitions verrouillent d'abord la ligne `proposals`
 * (SELECT ... FOR UPDATE) puis relisent l'état réel en base : deux joueurs
 * qui visent la dernière place en même temps sont sérialisés, un seul
 * réussit, l'autre reçoit un conflit (STATE-001).
 */

/** Clé de déduplication d'un créneau actif (CAL-005). */
function buildSlotKey(input: {
  venueId: string;
  localDate: string;
  slotStartHour: number;
  modeId: string;
}): string {
  return `${input.venueId}|${input.localDate}|${input.slotStartHour}|${input.modeId}`;
}

/**
 * Verrouille la proposition et renvoie son état courant.
 *
 * Le verrou est posé via le constructeur de requêtes (`.for("update")`) et
 * non par du SQL brut : les colonnes reviennent ainsi mappées sur les
 * propriétés du schéma, sans risque de lire `undefined` sur un nom de colonne
 * en snake_case.
 */
async function lockProposal(
  tx: Transaction,
  proposalId: number,
): Promise<ProposalRow> {
  const [row] = await tx
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .for("update");

  if (!row) throw new AppError("NOT_FOUND", "Cette session est introuvable.");
  return row;
}

/**
 * Récompenses réellement attribuables pour cette session (§8.2).
 *
 * Un mode non classé n'alimente pas le classement : les primes de meilleur
 * buteur, passeur et défenseur ne s'y appliquent pas. On n'affiche donc que
 * ce que le joueur peut effectivement gagner — afficher le barème complet
 * sur un match amical serait trompeur.
 */
function rewardsFor(
  division: Division | null,
  modeId: string,
): ProposalDetail["rewards"] {
  const ranked = getGameMode(modeId)?.ranked ?? false;
  // Une session sans division (match amical) utilise le barème de base.
  const applicable: Division = division ?? "D3";

  const kinds: RewardKind[] = ranked
    ? (Object.keys(DEFAULT_REWARD_POLICY) as RewardKind[])
    : ["bestTeam", "participation"];

  return kinds.map((kind) => ({
    kind,
    label: REWARD_KIND_LABELS[kind],
    amountUno: DEFAULT_REWARD_POLICY[kind][applicable],
  }));
}

function toSummary(
  row: ProposalRow,
  viewer?: { isParticipant: boolean; hasPaid: boolean },
): ProposalSummary {
  return {
    id: row.id,
    status: row.status,
    modeId: row.modeId as ProposalSummary["modeId"],
    venueId: row.venueId,
    venueName: row.venueName,
    startsAtUtc: row.startsAtUtc.toISOString(),
    localTimeLabel: row.localTimeLabel,
    localDate: row.localDate,
    timezone: row.timezone,
    division: row.division,
    priceEur: row.priceEur,
    priceUno: row.priceUno,
    minParticipants: row.minParticipants,
    participantCount: row.participantCount,
    paidCount: row.paidCount,
    paymentComplete: row.paymentComplete,
    creatorPlayerId: row.creatorPlayerId,
    ...(viewer ? { viewer } : {}),
  };
}

/**
 * Contrôle des règles de création (CAL-003, CAL-004).
 * Renvoie les valeurs dérivées côté serveur : le client ne fournit jamais
 * ni le prix, ni la division, ni le nombre de participants requis.
 */
function resolveNewProposal(
  input: CreateProposalInput,
  playerDivision: Division,
): {
  mode: GameMode;
  venue: { id: string; name: string; timezone: string };
  startsAtUtc: Date;
  localTimeLabel: string;
  division: Division | null;
} {
  const mode = requireSchedulableMode(input.modeId);

  const venue = getVenue(input.venueId);
  if (!venue) {
    throw new AppError("VALIDATION_ERROR", "Ce lieu n'existe pas.", {
      venueId: "Lieu inconnu",
    });
  }

  const slot = findSlot(mode, input.slotStartHour);
  if (!slot) {
    throw new AppError("VALIDATION_ERROR", "Ce créneau n'est pas disponible.", {
      slotStartHour: "Créneau invalide pour ce mode",
    });
  }

  // CAL-003 : la date doit être au moins à J+2 dans le fuseau du lieu.
  const today = todayIso(venue.timezone);
  const earliest = addDaysIso(today, MIN_PROPOSAL_LEAD_DAYS);
  if (diffDaysIso(earliest, input.date) < 0) {
    throw new AppError(
      "RULE_VIOLATION",
      `Une session doit être créée au moins ${MIN_PROPOSAL_LEAD_DAYS} jours à l'avance.`,
      { date: `Date la plus proche possible : ${earliest}` },
    );
  }

  return {
    mode,
    venue,
    startsAtUtc: zonedTimeToUtc(input.date, slot.startHour, venue.timezone),
    localTimeLabel: slot.label,
    // CAL-002 : UNO League est cloisonné par division, l'amical ne l'est pas.
    division: mode.divisionLocked ? playerDivision : null,
  };
}

export interface CreateProposalResult {
  proposal: ProposalSummary;
  /**
   * true lorsqu'une proposition identique existait déjà et que le joueur y a
   * été inscrit au lieu d'en créer une seconde (CAL-005).
   */
  joinedExisting: boolean;
}

export async function createProposal(
  actor: { playerId: number; userId: number },
  input: CreateProposalInput,
): Promise<CreateProposalResult> {
  const [player] = await db
    .select({ division: players.division })
    .from(players)
    .where(eq(players.id, actor.playerId))
    .limit(1);

  if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

  const resolved = resolveNewProposal(input, player.division);
  const slotKey = buildSlotKey({
    venueId: input.venueId,
    localDate: input.date,
    slotStartHour: input.slotStartHour,
    modeId: input.modeId,
  });

  try {
    const created = await db.transaction(async (tx) => {
      const inserted = await tx.insert(proposals).values({
        startsAtUtc: resolved.startsAtUtc,
        localDate: input.date,
        slotStartHour: input.slotStartHour,
        localTimeLabel: resolved.localTimeLabel,
        timezone: resolved.venue.timezone,
        venueId: resolved.venue.id,
        venueName: resolved.venue.name,
        modeId: resolved.mode.id,
        division: resolved.division,
        minParticipants: resolved.mode.minParticipants,
        priceEur: resolved.mode.priceEur,
        priceUno: eurToUno(resolved.mode.priceEur),
        rewardPolicyVersion: REWARD_POLICY_VERSION,
        status: "proposal",
        participantCount: 1,
        paidCount: 0,
        paymentComplete: false,
        creatorPlayerId: actor.playerId,
        activeSlotKey: slotKey,
      });

      const proposalId = Number(inserted[0].insertId);

      // CAL-003 : le créateur est automatiquement participant.
      await tx.insert(proposalParticipants).values({
        proposalId,
        playerId: actor.playerId,
      });

      await writeAudit(tx, {
        actorUserId: actor.userId,
        action: "proposal.create",
        entityType: "proposal",
        entityId: proposalId,
        after: { slotKey, modeId: resolved.mode.id, division: resolved.division },
      });

      const [row] = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposalId))
        .limit(1);
      return row as ProposalRow;
    });

    return {
      proposal: toSummary(created, { isParticipant: true, hasPaid: false }),
      joinedExisting: false,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    // CAL-005 : la proposition existe déjà. On n'en crée pas de doublon ; on
    // inscrit le joueur à celle qui existe, ce qui est l'intention réelle.
    const [existing] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.activeSlotKey, slotKey))
      .limit(1);

    if (!existing) {
      throw new AppError(
        "CONFLICT",
        "Ce créneau vient d'être pris. Actualisez la liste.",
      );
    }

    const proposal = await joinProposal(actor, existing.id);
    return { proposal, joinedExisting: true };
  }
}

/**
 * Inscription à une proposition (CAL-006, CAL-007).
 * Idempotente : réinscrire un joueur déjà inscrit ne crée pas de doublon et
 * ne renvoie pas d'erreur.
 */
export async function joinProposal(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    const [existing] = await tx
      .select({ id: proposalParticipants.id, hasPaid: proposalParticipants.hasPaid })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (existing) {
      // CAL-006 : opération idempotente, aucun doublon de participant.
      return toSummary(proposal, {
        isParticipant: true,
        hasPaid: existing.hasPaid,
      });
    }

    if (proposal.status !== "proposal") {
      throw new AppError("PROPOSAL_CLOSED");
    }
    if (proposal.participantCount >= proposal.minParticipants) {
      throw new AppError("PROPOSAL_FULL");
    }

    // CAL-002 : UNO League est réservé aux joueurs de la division concernée.
    if (proposal.division !== null) {
      const [player] = await tx
        .select({ division: players.division })
        .from(players)
        .where(eq(players.id, actor.playerId))
        .limit(1);
      if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");
      if (player.division !== proposal.division) {
        throw new AppError(
          "RULE_VIOLATION",
          `Cette session est réservée à la division ${proposal.division}.`,
        );
      }
    }

    await tx
      .insert(proposalParticipants)
      .values({ proposalId, playerId: actor.playerId });

    const participantCount = proposal.participantCount + 1;
    // CAL-007 : le quota atteint ferme les inscriptions et fait basculer en
    // réservation, sans intervention extérieure.
    const reachedQuota = participantCount >= proposal.minParticipants;

    await tx
      .update(proposals)
      .set({
        participantCount,
        status: reachedQuota ? "reservation" : "proposal",
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    if (reachedQuota) {
      await writeAudit(tx, {
        actorUserId: actor.userId,
        action: "proposal.status.update",
        entityType: "proposal",
        entityId: proposalId,
        before: { status: "proposal" },
        after: { status: "reservation", participantCount },
      });
    }

    return toSummary(
      {
        ...proposal,
        participantCount,
        status: reachedQuota ? "reservation" : "proposal",
      },
      { isParticipant: true, hasPaid: false },
    );
  });
}

/**
 * Désinscription (CAL-008).
 * Autorisée tant que la session est au statut proposition. Une fois le quota
 * atteint, la sortie exige une intervention administrative (remboursement,
 * réattribution de la place).
 */
export async function leaveProposal(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    const [participant] = await tx
      .select({ id: proposalParticipants.id, hasPaid: proposalParticipants.hasPaid })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (!participant) {
      throw new AppError("NOT_PARTICIPANT");
    }

    if (proposal.status !== "proposal") {
      throw new AppError(
        "RULE_VIOLATION",
        "Les inscriptions sont closes : contactez un administrateur pour vous désister.",
      );
    }

    if (proposal.creatorPlayerId === actor.playerId && proposal.participantCount > 1) {
      throw new AppError(
        "RULE_VIOLATION",
        "Le créateur ne peut pas quitter une session à laquelle d'autres joueurs sont inscrits.",
      );
    }

    await tx
      .delete(proposalParticipants)
      .where(eq(proposalParticipants.id, participant.id));

    const participantCount = Math.max(0, proposal.participantCount - 1);

    if (participantCount === 0) {
      // Plus personne : la proposition est annulée et le créneau libéré.
      await tx
        .update(proposals)
        .set({
          participantCount: 0,
          status: "cancelled",
          activeSlotKey: null,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      return toSummary(
        { ...proposal, participantCount: 0, status: "cancelled" },
        { isParticipant: false, hasPaid: false },
      );
    }

    await tx
      .update(proposals)
      .set({ participantCount, updatedAt: new Date() })
      .where(eq(proposals.id, proposalId));

    return toSummary(
      { ...proposal, participantCount },
      { isParticipant: false, hasPaid: false },
    );
  });
}

/**
 * Enregistre le paiement validé d'un participant et fait basculer la
 * réservation en session lorsque tout le monde a payé (CAL-011).
 * Appelée par le service de paiement, jamais directement par un routeur.
 */
export async function markParticipantPaid(
  tx: Transaction,
  params: { proposalId: number; playerId: number; paymentId: number },
): Promise<{ status: ProposalRow["status"]; paymentComplete: boolean }> {
  const proposal = await lockProposal(tx, params.proposalId);

  const result = await tx
    .update(proposalParticipants)
    .set({ hasPaid: true, paymentId: params.paymentId })
    .where(
      and(
        eq(proposalParticipants.proposalId, params.proposalId),
        eq(proposalParticipants.playerId, params.playerId),
        eq(proposalParticipants.hasPaid, false),
      ),
    );

  // Aucune ligne modifiée : le participant était déjà payé. On ne recompte
  // pas, sinon un webhook rejoué ferait dériver `paidCount` (ANN-004).
  if (Number(result[0].affectedRows ?? 0) === 0) {
    return { status: proposal.status, paymentComplete: proposal.paymentComplete };
  }

  const [paidRow] = await tx
    .select({ paid: count() })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, params.proposalId),
        eq(proposalParticipants.hasPaid, true),
      ),
    );

  const paidCount = Number(paidRow?.paid ?? 0);
  const allPaid = paidCount >= proposal.participantCount && proposal.participantCount > 0;
  const nextStatus =
    allPaid && proposal.status === "reservation" ? "session" : proposal.status;

  await tx
    .update(proposals)
    .set({
      paidCount,
      paymentComplete: allPaid,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, params.proposalId));

  return { status: nextStatus, paymentComplete: allPaid };
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

async function viewerFlagsFor(
  executor: Executor,
  proposalIds: number[],
  playerId: number,
): Promise<Map<number, { isParticipant: boolean; hasPaid: boolean }>> {
  if (proposalIds.length === 0) return new Map();

  const rows = await executor
    .select({
      proposalId: proposalParticipants.proposalId,
      hasPaid: proposalParticipants.hasPaid,
    })
    .from(proposalParticipants)
    .where(
      and(
        inArray(proposalParticipants.proposalId, proposalIds),
        eq(proposalParticipants.playerId, playerId),
      ),
    );

  return new Map(
    rows.map((row) => [row.proposalId, { isParticipant: true, hasPaid: row.hasPaid }]),
  );
}

/**
 * Liste filtrée (CAL-002).
 * Le filtre de division n'est pas un paramètre client : pour UNO League, le
 * serveur impose la division du joueur.
 */
export async function listProposals(
  viewer: { playerId: number; division: Division },
  input: ListProposalsInput,
): Promise<ProposalSummary[]> {
  const conditions = [ne(proposals.status, "cancelled")];

  if (input.from) conditions.push(gte(proposals.localDate, input.from));
  if (input.to) conditions.push(lte(proposals.localDate, input.to));
  if (input.venueId) conditions.push(eq(proposals.venueId, input.venueId));
  if (input.modeId) conditions.push(eq(proposals.modeId, input.modeId));
  if (input.status) conditions.push(eq(proposals.status, input.status));

  // CAL-002 : un joueur D2 ne voit que les propositions League D2, mais voit
  // les matchs amicaux de toutes les divisions.
  conditions.push(
    or(isNull(proposals.division), eq(proposals.division, viewer.division))!,
  );

  let rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(asc(proposals.startsAtUtc))
    .limit(300);

  if (input.mineOnly) {
    const mine = await viewerFlagsFor(
      db,
      rows.map((row) => row.id),
      viewer.playerId,
    );
    rows = rows.filter((row) => mine.has(row.id));
  }

  const flags = await viewerFlagsFor(
    db,
    rows.map((row) => row.id),
    viewer.playerId,
  );

  return rows.map((row) =>
    toSummary(row, flags.get(row.id) ?? { isParticipant: false, hasPaid: false }),
  );
}

/** Détail complet avec participants et récompenses (CAL-012). */
export async function getProposal(
  viewer: { playerId: number },
  proposalId: number,
): Promise<ProposalDetail> {
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Cette session est introuvable.");

  const participants = await db
    .select({
      playerId: proposalParticipants.playerId,
      hasPaid: proposalParticipants.hasPaid,
      joinedAt: proposalParticipants.joinedAt,
      displayName: players.displayName,
      profilePhotoUrl: players.profilePhotoUrl,
      division: players.division,
    })
    .from(proposalParticipants)
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(eq(proposalParticipants.proposalId, proposalId))
    .orderBy(asc(proposalParticipants.joinedAt));

  const own = participants.find((p) => p.playerId === viewer.playerId);

  return {
    ...toSummary(row, {
      isParticipant: Boolean(own),
      hasPaid: own?.hasPaid ?? false,
    }),
    participants: participants.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      profilePhotoUrl: p.profilePhotoUrl,
      division: p.division,
      hasPaid: p.hasPaid,
      joinedAt: p.joinedAt.toISOString(),
    })),
    rewards: rewardsFor(row.division, row.modeId),
  };
}

/** Prochaines sessions du joueur, triées par date (HOME-001). */
export async function listUpcomingForPlayer(
  playerId: number,
  limit: number,
): Promise<ProposalSummary[]> {
  const rows = await db
    .select({ proposal: proposals, hasPaid: proposalParticipants.hasPaid })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        gte(proposals.startsAtUtc, new Date()),
        inArray(proposals.status, ["proposal", "reservation", "session"]),
      ),
    )
    .orderBy(asc(proposals.startsAtUtc))
    .limit(limit);

  return rows.map((row) =>
    toSummary(row.proposal, { isParticipant: true, hasPaid: row.hasPaid }),
  );
}

/**
 * Historique des sessions jouées (MATCH-006).
 *
 * Une session clôturée y figure quel que soit son horaire : c'est le statut
 * qui fait foi, pas la date. Une session encore confirmée n'y apparaît que
 * si son heure est passée — sinon elle relève des sessions à venir.
 */
export async function listHistoryForPlayer(
  playerId: number,
  limit: number,
): Promise<ProposalSummary[]> {
  const rows = await db
    .select({ proposal: proposals, hasPaid: proposalParticipants.hasPaid })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        or(
          eq(proposals.status, "completed"),
          and(
            eq(proposals.status, "session"),
            lte(proposals.startsAtUtc, new Date()),
          ),
        ),
      ),
    )
    .orderBy(desc(proposals.startsAtUtc))
    .limit(limit);

  return rows.map((row) =>
    toSummary(row.proposal, { isParticipant: true, hasPaid: row.hasPaid }),
  );
}

/**
 * Tâche d'entretien (cas limite « proposition expirée dont la date est
 * passée », CDC §21.1).
 *
 *  - une proposition dont l'heure est passée sans avoir atteint son quota est
 *    annulée et son créneau libéré ;
 *  - une session dont l'heure est passée devient terminée.
 */
export async function expireStaleProposals(): Promise<{
  cancelled: number;
  completed: number;
}> {
  const now = new Date();

  const cancelled = await db
    .update(proposals)
    .set({ status: "cancelled", activeSlotKey: null, updatedAt: now })
    .where(
      and(
        inArray(proposals.status, ["proposal", "reservation"]),
        lte(proposals.startsAtUtc, now),
      ),
    );

  const completed = await db
    .update(proposals)
    .set({ status: "completed", activeSlotKey: null, updatedAt: now })
    .where(and(eq(proposals.status, "session"), lte(proposals.startsAtUtc, now)));

  return {
    cancelled: Number(cancelled[0].affectedRows ?? 0),
    completed: Number(completed[0].affectedRows ?? 0),
  };
}

export { toSummary as toProposalSummary, lockProposal, rewardsFor };
