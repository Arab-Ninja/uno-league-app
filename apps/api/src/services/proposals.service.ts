import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  AppError,
  DEFAULT_REWARD_POLICY,
  MIN_PROPOSAL_LEAD_DAYS,
  PAYMENT_DEADLINE_HOURS,
  REWARD_KIND_LABELS,
  REWARD_POLICY_VERSION,
  addDaysIso,
  diffDaysIso,
  eurToUno,
  findSlot,
  getGameMode,
  requireSchedulableMode,
  todayIso,
  zonedTimeToUtc,
  type CreateProposalInput,
  type Division,
  type GameMode,
  type ListProposalsInput,
  type ProposalDetail,
  type ProposalSummary,
  type PublicPlayer,
  type RewardKind,
  type SubstituteView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  players,
  proposalParticipants,
  proposalSubstitutes,
  proposals,
  type ProposalRow,
} from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { notifyPlayer } from "./notifications.service.js";
import { requireBookableVenue } from "./venues.service.js";

import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";

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
/**
 * Récompenses réellement versées par une session (§8.2).
 *
 * Un mode non classé n'en verse **aucune** : ni participation, ni meilleure
 * équipe, ni distinction. La liste est donc vide, et non pas amputée — en
 * annoncer qui ne seront jamais créditées serait mentir au joueur avant même
 * qu'il paie sa place.
 */
function rewardsFor(
  division: Division | null,
  modeId: string,
): ProposalDetail["rewards"] {
  const ranked = getGameMode(modeId)?.ranked ?? false;
  if (!ranked) return [];

  // Une session sans division retombe sur le barème de base.
  const applicable: Division = division ?? "D3";

  return (Object.keys(DEFAULT_REWARD_POLICY) as RewardKind[]).map((kind) => ({
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
    paymentDeadline: row.paymentDeadline ? row.paymentDeadline.toISOString() : null,
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
  venue: { id: string; name: string; timezone: string },
): {
  mode: GameMode;
  venue: { id: string; name: string; timezone: string };
  startsAtUtc: Date;
  localTimeLabel: string;
  division: Division | null;
} {
  const mode = requireSchedulableMode(input.modeId);

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

  // La salle est relue en base : elle est administrable, donc sa liste n'est
  // plus connue à la compilation, et une salle retirée doit être refusée.
  const venue = await requireBookableVenue(db, input.venueId);
  const resolved = resolveNewProposal(input, player.division, {
    id: venue.slug,
    name: venue.name,
    timezone: venue.timezone,
  });
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

    await recordAdminEvent({
      type: "proposal.created",
      body:
        `${resolved.mode.name} le ${input.date} à ${resolved.venue.name} ` +
        `(${resolved.localTimeLabel})${resolved.division ? ` — ${resolved.division}` : ""}.`,
      entityType: "proposal",
      entityId: created.id,
      playerId: actor.playerId,
      key: `proposal:${created.id}:created`,
      // Après commit : la proposition et son créateur sont déjà écrits.
    }, db);

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

    const [player] = await tx
      .select({ division: players.division, accountType: players.accountType })
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);
    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

    // ROLE-003 : le rôle d'arbitre est exclusif. Sans ce contrôle serveur, un
    // arbitre pourrait prendre une place de joueur en appelant l'API
    // directement — le bouton masqué dans l'interface ne protège rien.
    if (player.accountType === "referee") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un compte arbitre ne participe pas comme joueur. Proposez-vous comme arbitre.",
      );
    }

    // CAL-002 : UNO League est réservé aux joueurs de la division concernée.
    if (proposal.division !== null && player.division !== proposal.division) {
      throw new AppError(
        "RULE_VIOLATION",
        `Cette session est réservée à la division ${proposal.division}.`,
      );
    }

    await tx
      .insert(proposalParticipants)
      .values({ proposalId, playerId: actor.playerId });

    const participantCount = proposal.participantCount + 1;
    // CAL-007 : le quota atteint ferme les inscriptions et fait basculer en
    // réservation, sans intervention extérieure.
    const reachedQuota = participantCount >= proposal.minParticipants;

    // CAL-008 : l'horloge des 24 heures démarre au moment exact où la
    // réservation se forme. La calculer à l'affichage aurait donné une
    // échéance qui glisse à chaque rafraîchissement.
    const paymentDeadline = reachedQuota
      ? new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 3_600_000)
      : proposal.paymentDeadline;

    await tx
      .update(proposals)
      .set({
        participantCount,
        status: reachedQuota ? "reservation" : "proposal",
        paymentDeadline,
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

      await recordAdminEvent(
        {
          type: "proposal.reservation",
          body:
            `${proposal.venueName}, ${proposal.localDate} ${proposal.localTimeLabel} : ` +
            `${participantCount} inscrits, paiements attendus avant le ` +
            `${paymentDeadline?.toLocaleString("fr-BE", { timeZone: proposal.timezone }) ?? "—"}.`,
          entityType: "proposal",
          entityId: proposalId,
          key: `proposal:${proposalId}:reservation`,
        },
        tx,
      );
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
      hasPaid: proposalParticipants.hasPaid,
      joinedAt: proposalParticipants.joinedAt,
      sessionRank: proposalParticipants.sessionRank,
      sessionPoints: proposalParticipants.sessionPoints,
      movement: proposalParticipants.movement,
      ...publicPlayerColumns,
    })
    .from(proposalParticipants)
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(eq(proposalParticipants.proposalId, proposalId))
    // Une session clôturée s'affiche dans l'ordre de son classement ; une
    // session à venir dans l'ordre des inscriptions.
    .orderBy(asc(proposalParticipants.sessionRank), asc(proposalParticipants.joinedAt));

  const substitutes = await listSubstitutes(db, proposalId);
  const referee = await refereeOf(db, proposalId);

  const own = participants.find((p) => p.id === viewer.playerId);

  return {
    ...toSummary(row, {
      isParticipant: Boolean(own),
      hasPaid: own?.hasPaid ?? false,
    }),
    participants: participants.map(
      ({ hasPaid, joinedAt, sessionRank, sessionPoints, movement, ...player }) => ({
        player: toPublicPlayer(player),
        hasPaid,
        joinedAt: joinedAt.toISOString(),
        sessionRank,
        sessionPoints: sessionPoints === null ? null : Number(sessionPoints),
        movement,
      }),
    ),
    rewards: rewardsFor(row.division, row.modeId),
    substitutes,
    referee,
    // Le serveur décide seul de ce qui est reprenable : comparer des dates
    // côté client reviendrait à faire dépendre une règle métier du fuseau et
    // de l'horloge du téléphone.
    claimableSeats: overdueSeats(row, participants),
  };
}


// ---------------------------------------------------------------------------
// Remplaçants (CAL-008)
// ---------------------------------------------------------------------------

/**
 * Places non réglées dont l'échéance est passée.
 *
 * Calculé côté serveur, jamais côté client : faire dépendre une règle métier
 * de l'horloge et du fuseau d'un téléphone rendrait la même réservation
 * « reprenable » ici et pas là.
 */
function overdueSeats(
  proposal: ProposalRow,
  participants: { hasPaid: boolean; joinedAt: Date; id: number }[],
): ProposalDetail["claimableSeats"] {
  if (proposal.status !== "reservation" || !proposal.paymentDeadline) return [];
  if (proposal.paymentDeadline.getTime() > Date.now()) return [];

  const overdueSince = proposal.paymentDeadline.toISOString();

  return participants
    .filter((participant) => !participant.hasPaid)
    .map((participant) => ({
      // Le participant est déjà chargé avec les colonnes de la carte : on
      // reconstruit la vue publique sans requête supplémentaire.
      player: toPublicPlayer(participant as unknown as Parameters<typeof toPublicPlayer>[0]),
      overdueSince,
    }));
}

/**
 * Arbitre attaché à une session, s'il y en a un (ROLE-003).
 *
 * La lecture vit ici, avec les autres lectures de propositions, tandis que
 * l'affectation vit dans `referees.service`. Les mettre toutes deux du côté
 * arbitre aurait créé un cycle d'import entre les deux services : le détail
 * d'une proposition a besoin de son arbitre, et l'affectation a besoin du
 * verrou de la proposition.
 */
export async function refereeOf(
  executor: Executor,
  proposalId: number,
): Promise<PublicPlayer | null> {
  const [row] = await executor
    .select(publicPlayerColumns)
    .from(proposals)
    .innerJoin(players, eq(players.id, proposals.refereePlayerId))
    .where(eq(proposals.id, proposalId))
    .limit(1);

  return row ? toPublicPlayer(row) : null;
}

export async function listSubstitutes(
  executor: Executor,
  proposalId: number,
): Promise<SubstituteView[]> {
  const rows = await executor
    .select({
      status: proposalSubstitutes.status,
      createdAt: proposalSubstitutes.createdAt,
      ...publicPlayerColumns,
    })
    .from(proposalSubstitutes)
    .innerJoin(players, eq(players.id, proposalSubstitutes.playerId))
    .where(
      and(
        eq(proposalSubstitutes.proposalId, proposalId),
        ne(proposalSubstitutes.status, "withdrawn"),
      ),
    )
    .orderBy(asc(proposalSubstitutes.createdAt));

  return rows.map(({ status, createdAt, ...player }) => ({
    player: toPublicPlayer(player),
    status,
    createdAt: createdAt.toISOString(),
  }));
}

/**
 * Se déclarer remplaçant sur une réservation (CAL-008).
 *
 * Ouvert à tout joueur non inscrit, dès que la réservation est formée : il
 * faut pouvoir se positionner **avant** l'échéance, sinon la file serait
 * toujours vide au moment où elle devient utile.
 */
export async function registerSubstitute(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<SubstituteView[]> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    if (proposal.status !== "reservation") {
      throw new AppError(
        "RULE_VIOLATION",
        proposal.status === "proposal"
          ? "Cette session est encore ouverte : inscrivez-vous directement."
          : "Cette session n'attend plus de remplaçant.",
      );
    }

    const [participant] = await tx
      .select({ id: proposalParticipants.id })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (participant) {
      throw new AppError(
        "RULE_VIOLATION",
        "Vous êtes déjà inscrit à cette session.",
      );
    }

    const [player] = await tx
      .select({ division: players.division, accountType: players.accountType })
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);
    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

    if (player.accountType === "referee") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un compte arbitre ne participe pas comme joueur. Proposez-vous comme arbitre.",
      );
    }

    // CAL-002 : une session de division reste réservée à cette division,
    // remplaçants compris — sinon la règle se contournerait par la file.
    if (proposal.division !== null && player.division !== proposal.division) {
      throw new AppError(
        "RULE_VIOLATION",
        `Cette session est réservée à la division ${proposal.division}.`,
      );
    }

    try {
      await tx
        .insert(proposalSubstitutes)
        .values({ proposalId, playerId: actor.playerId, status: "waiting" });
    } catch (error) {
      // Déjà dans la file : l'opération est idempotente.
      if (!isDuplicateKeyError(error)) throw error;
      await tx
        .update(proposalSubstitutes)
        .set({ status: "waiting" })
        .where(
          and(
            eq(proposalSubstitutes.proposalId, proposalId),
            eq(proposalSubstitutes.playerId, actor.playerId),
          ),
        );
    }

    await recordAdminEvent(
      {
        type: "substitute.registered",
        body:
          `Un remplaçant s'est déclaré pour la session du ${proposal.localDate} ` +
          `à ${proposal.venueName}.`,
        entityType: "proposal",
        entityId: proposalId,
        playerId: actor.playerId,
        key: `proposal:${proposalId}:substitute:${actor.playerId}`,
      },
      tx,
    );

    return listSubstitutes(tx, proposalId);
  });
}

/** Retrait de la file d'attente. */
export async function withdrawSubstitute(
  actor: { playerId: number },
  proposalId: number,
): Promise<SubstituteView[]> {
  return db.transaction(async (tx) => {
    await tx
      .update(proposalSubstitutes)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(proposalSubstitutes.proposalId, proposalId),
          eq(proposalSubstitutes.playerId, actor.playerId),
          eq(proposalSubstitutes.status, "waiting"),
        ),
      );

    return listSubstitutes(tx, proposalId);
  });
}

export interface ClaimableSeat {
  proposalId: number;
  replacedPlayerId: number;
  priceUno: number;
}

/**
 * Réserve la place d'un joueur en retard au profit d'un remplaçant.
 *
 * Appelée sous le verrou de la proposition, **avant** le paiement : c'est ce
 * qui rend l'opération sûre quand deux remplaçants visent la même place au
 * même instant. Le second trouve la place déjà prise et reçoit un refus
 * explicite, plutôt qu'un débit pour rien.
 */
export async function takeOverSeat(
  tx: Transaction,
  params: { proposalId: number; playerId: number; replacePlayerId?: number },
): Promise<ClaimableSeat> {
  const proposal = await lockProposal(tx, params.proposalId);

  if (proposal.status !== "reservation") {
    throw new AppError(
      "PROPOSAL_CLOSED",
      "Cette session n'attend plus de paiement.",
    );
  }
  if (!proposal.paymentDeadline || proposal.paymentDeadline.getTime() > Date.now()) {
    throw new AppError(
      "RULE_VIOLATION",
      "Le délai de paiement de 24 heures n'est pas encore écoulé.",
    );
  }

  const conditions = [
    eq(proposalParticipants.proposalId, params.proposalId),
    eq(proposalParticipants.hasPaid, false),
  ];
  if (params.replacePlayerId !== undefined) {
    conditions.push(eq(proposalParticipants.playerId, params.replacePlayerId));
  }

  // La place la plus anciennement inscrite part la première : à défaut de
  // critère, ce serait le hasard de l'ordre de lecture.
  const [seat] = await tx
    .select({
      id: proposalParticipants.id,
      playerId: proposalParticipants.playerId,
    })
    .from(proposalParticipants)
    .where(and(...conditions))
    .orderBy(asc(proposalParticipants.joinedAt))
    .limit(1);

  if (!seat) {
    throw new AppError(
      "CONFLICT",
      "Cette place vient d'être réglée ou reprise par un autre remplaçant.",
    );
  }

  const [already] = await tx
    .select({ id: proposalParticipants.id })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, params.proposalId),
        eq(proposalParticipants.playerId, params.playerId),
      ),
    )
    .limit(1);

  if (already) {
    throw new AppError("RULE_VIOLATION", "Vous êtes déjà inscrit à cette session.");
  }

  // La place change de titulaire sans passer par une suppression : le
  // compteur de participants reste juste, et l'historique dit qui a cédé sa
  // place à qui.
  await tx
    .update(proposalParticipants)
    .set({
      playerId: params.playerId,
      joinedAt: new Date(),
      replacedPlayerId: seat.playerId,
    })
    .where(eq(proposalParticipants.id, seat.id));

  await tx
    .update(proposalSubstitutes)
    .set({
      status: "promoted",
      replacedPlayerId: seat.playerId,
      promotedAt: new Date(),
    })
    .where(
      and(
        eq(proposalSubstitutes.proposalId, params.proposalId),
        eq(proposalSubstitutes.playerId, params.playerId),
      ),
    );

  return {
    proposalId: params.proposalId,
    replacedPlayerId: seat.playerId,
    priceUno: proposal.priceUno,
  };
}

/**
 * Places non réglées dont l'échéance est passée, pour la tâche d'entretien
 * et pour le tableau de bord.
 */
export async function overdueReservations(): Promise<
  { proposalId: number; playerId: number; venueName: string; localDate: string }[]
> {
  const rows = await db
    .select({
      proposalId: proposals.id,
      playerId: proposalParticipants.playerId,
      venueName: proposals.venueName,
      localDate: proposals.localDate,
    })
    .from(proposals)
    .innerJoin(
      proposalParticipants,
      eq(proposalParticipants.proposalId, proposals.id),
    )
    .where(
      and(
        eq(proposals.status, "reservation"),
        eq(proposalParticipants.hasPaid, false),
        lte(proposals.paymentDeadline, new Date()),
      ),
    );

  return rows;
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
 *  - les places non réglées au-delà du délai sont signalées, au joueur comme
 *    à l'administration ;
 *  - les sessions jouées mais non saisies sont comptées, sans être clôturées :
 *    seule une saisie de résultats peut les terminer (MATCH-003).
 */
export async function expireStaleProposals(): Promise<{
  cancelled: number;
  awaitingEntry: number;
  overdue: number;
}> {
  const now = new Date();

  // Les retards de paiement sont relevés AVANT l'annulation des propositions
  // dépassées : sinon une réservation annulée le même jour n'aurait jamais
  // averti personne.
  const overdue = await notifyOverduePayments();

  const cancelled = await db
    .update(proposals)
    .set({ status: "cancelled", activeSlotKey: null, updatedAt: now })
    .where(
      and(
        inArray(proposals.status, ["proposal", "reservation"]),
        lte(proposals.startsAtUtc, now),
      ),
    );

  // Une session jouée n'est **plus** clôturée automatiquement.
  //
  // La clôture décide désormais des distinctions, verse les récompenses et
  // fait monter ou descendre les joueurs de division (RANK-005) : la
  // prononcer sans que personne n'ait saisi la feuille de match
  // distribuerait des récompenses pour une session dont on ignore tout, et
  // rendrait le classement de session vide définitif. Une session dont
  // l'heure est passée reste donc au statut « confirmée » et rejoint la file
  // de saisie de l'administration (MATCH-003).
  const awaiting = await db
    .select({ total: count() })
    .from(proposals)
    .where(and(eq(proposals.status, "session"), lte(proposals.startsAtUtc, now)));

  return {
    cancelled: Number(cancelled[0].affectedRows ?? 0),
    awaitingEntry: Number(awaiting[0]?.total ?? 0),
    overdue,
  };
}

/**
 * Sessions confirmées dont l'heure est passée et dont les résultats restent à
 * saisir (MATCH-003).
 *
 * C'est la file de travail de la supervision : ni les propositions encore
 * ouvertes, ni les sessions déjà clôturées n'y figurent.
 *
 * `excludeForPlayerId` retire de la file les sessions que ce joueur a jouées
 * ou arbitrées (SUP-001). Un superviseur ne doit pas seulement se voir refuser
 * la saisie de ses propres sessions : il ne doit pas les voir dans sa file,
 * sans quoi la règle ne se découvre qu'au moment du refus.
 */
export async function pendingSessions(
  limit = 30,
  excludeForPlayerId?: number,
): Promise<ProposalSummary[]> {
  const conditions = [
    eq(proposals.status, "session"),
    lte(proposals.startsAtUtc, new Date()),
  ];

  if (excludeForPlayerId !== undefined) {
    conditions.push(
      sql`${proposals.id} NOT IN (
        SELECT ${proposalParticipants.proposalId}
        FROM ${proposalParticipants}
        WHERE ${proposalParticipants.playerId} = ${excludeForPlayerId}
      )`,
    );
    conditions.push(
      or(
        isNull(proposals.refereePlayerId),
        ne(proposals.refereePlayerId, excludeForPlayerId),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(asc(proposals.startsAtUtc))
    .limit(limit);

  return rows.map((row) => toSummary(row));
}

/**
 * Signale les places non réglées dont l'échéance est passée (CAL-008).
 *
 * Une notification par joueur et par session : la clé d'évènement porte les
 * deux identifiants, donc repasser la tâche toutes les heures ne réémet rien.
 * Le joueur est prévenu, l'administration aussi, et la place devient
 * accessible aux remplaçants.
 */
export async function notifyOverduePayments(): Promise<number> {
  const late = await overdueReservations();

  for (const seat of late) {
    await notifyPlayer(
      {
        playerId: seat.playerId,
        eventKey: `proposal:${seat.proposalId}:overdue`,
        title: "Paiement en retard",
        body:
          `Votre place du ${seat.localDate} à ${seat.venueName} n'est pas réglée. ` +
          `Elle peut désormais être reprise par un remplaçant.`,
      },
      // Tâche d'entretien : aucune transaction en cours.
      db,
    );

    await recordAdminEvent({
      type: "payment.overdue",
      body:
        `Place non réglée après ${PAYMENT_DEADLINE_HOURS} h — session du ` +
        `${seat.localDate} à ${seat.venueName}.`,
      entityType: "proposal",
      entityId: seat.proposalId,
      playerId: seat.playerId,
      key: `proposal:${seat.proposalId}:overdue:${seat.playerId}`,
    }, db);
  }

  return late.length;
}

export { toSummary as toProposalSummary, lockProposal, rewardsFor };
