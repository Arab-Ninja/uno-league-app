import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  AppError,
  REWARD_POLICY_VERSION,
  TEAM_SIZE,
  TRACKER_TEAM_PRESETS,
  aggregateSession,
  draftTeams,
  eurToUno,
  findSlot,
  getGameMode,
  nextPairing,
  publicationBlockers,
  rankingScore,
  defensiveScore,
  DEFAULT_POSITION,
  requireSchedulableMode,
  trackerMatchDurationMs,
  trackerMoments,
  zonedTimeToUtc,
  type Division,
  type TrackerAddParticipantInput,
  type TrackerCreateSessionInput,
  type TrackerEvent,
  type TrackerEventView,
  type TrackerMatchView,
  type TrackerParticipantView,
  type TrackerPublishInput,
  type TrackerSessionSummary,
  type TrackerSheet,
  type TrackerSyncInput,
  type TrackerTeamView,
  type TrackerUpdateSessionInput,
  type TrackerUpdateTeamInput,
  type TrackerWarning,
  type TrackerAngles,
  type VideoMoment,
  type PublicPlayer,
  type TeamView,
  LIMITS,
  XP_AWARDS,
  isDirectVideoUrl,
  parseVideoUrl,
  type TrackerVideo,
  gabarit,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  matchStats,
  matches,
  players,
  proposalParticipants,
  proposals,
  statEvents,
  statMatches,
  statParticipants,
  sessionVideos,
  statSessionVideos,
  statSessions,
  statTeams,
  teamMembers,
  teams,
  transactions as ledgerTransactions,
  type StatSessionRow,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import {
  applyRecordSession,
  buildPodium,
  sessionPodium,
  sessionScoreboard,
  type SessionScoreboardRow,
} from "./matches.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { requireBookableVenue } from "./venues.service.js";
import { readTeams as readSessionTeams } from "./session-teams.service.js";
import { awardXp } from "./progression.service.js";
import { announceVideo } from "./supervision.service.js";
import { refundSeat } from "./eligibility.service.js";
import { debit } from "./ledger.service.js";
import { ecriture } from "../i18n/index.js";

/**
 * Saisie des statistiques en visionnage (TRACK-001).
 *
 * La feuille de saisie vit à côté de la réservation, pas dedans. C'est un
 * choix, et voici pourquoi : une réservation naît d'un besoin commercial —
 * des places, des paiements, un quota — alors qu'une feuille naît d'un besoin
 * de relevé. Les confondre obligeait à passer par le parcours de réservation
 * complet pour saisir dix minutes de jeu, ce qui rendait la saisie plus longue
 * que le match.
 *
 * La feuille est donc autonome : trois équipes, des joueurs qu'on change en
 * deux gestes, des matchs qu'on enchaîne, des actions horodatées. La
 * **publication** fait ensuite le pont vers le classement officiel, en
 * empruntant exactement le chemin d'une session réservée — mêmes validations,
 * même XP, mêmes distinctions, mêmes montées et descentes.
 */

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

async function lockSession(
  tx: Transaction,
  sessionId: number,
): Promise<StatSessionRow> {
  const [row] = await tx
    .select()
    .from(statSessions)
    .where(eq(statSessions.id, sessionId))
    .for("update");

  if (!row)
    throw new AppError("NOT_FOUND", "Cette feuille de saisie est introuvable.");
  return row;
}

/**
 * Une feuille publiée est figée.
 *
 * Ses statistiques sont parties dans les compteurs de carrière, ses
 * distinctions sont décernées et ses mouvements de division appliqués. La
 * modifier ne changerait plus rien à ces effets : elle ne raconterait
 * simplement plus la même chose que ce qui a été comptabilisé.
 */
function assertEditable(session: StatSessionRow): void {
  if (session.status === "published") {
    throw new AppError(
      "RULE_VIOLATION",
      "Cette feuille est publiée : ses statistiques sont déjà comptabilisées.",
    );
  }
}

function toSessionSummary(
  row: StatSessionRow,
  counts: { participants: number; matches: number; events: number },
  videos: TrackerVideo[] = [],
): TrackerSessionSummary {
  return {
    id: row.id,
    label: row.label,
    localDate: row.localDate,
    slotStartHour: row.slotStartHour,
    venueId: row.venueId,
    venueName: row.venueName,
    division: row.division,
    modeId: row.modeId,
    status: row.status,
    videos,
    participantCount: counts.participants,
    matchCount: counts.matches,
    eventCount: counts.events,
    proposalId: row.proposalId,
    publishedProposalId: row.publishedProposalId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Refuse à un superviseur la feuille sur laquelle il figure (SUP-001).
 *
 * Le contrôle existait déjà à la publication : c'est là que se décident les
 * distinctions, les UNO et les divisions. Il manquait en amont, si bien qu'un
 * superviseur pouvait ouvrir et remplir la feuille de sa propre séance, pour
 * ne se voir refuser qu'au dernier geste. Un écran qu'on ne peut pas conclure
 * vaut moins que pas d'écran : le refus vient désormais dès l'ouverture.
 *
 * L'administration en est dispensée, comme partout : c'est elle qui tranche
 * les litiges, et une ligue dont l'organisateur joue serait bloquée.
 */
export async function assertMayHandleSheet(
  executor: Executor,
  actor: { playerId: number; role: "user" | "admin" },
  sessionId: number,
): Promise<void> {
  if (actor.role === "admin") return;

  const [own] = await executor
    .select({ id: statParticipants.id })
    .from(statParticipants)
    .where(
      and(
        eq(statParticipants.sessionId, sessionId),
        eq(statParticipants.playerId, actor.playerId),
      ),
    )
    .limit(1);

  if (own) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous figurez sur cette feuille : sa saisie revient à un autre superviseur.",
    );
  }
}

/** La feuille dont relève ce joueur de feuille, pour y appliquer le droit. */
export async function sessionOfParticipant(
  executor: Executor,
  participantId: number,
): Promise<number | null> {
  const [row] = await executor
    .select({ sessionId: statParticipants.sessionId })
    .from(statParticipants)
    .where(eq(statParticipants.id, participantId))
    .limit(1);

  return row?.sessionId ?? null;
}

/** La feuille dont relève cette équipe de feuille. */
export async function sessionOfTeam(
  executor: Executor,
  teamId: number,
): Promise<number | null> {
  const [row] = await executor
    .select({ sessionId: statTeams.sessionId })
    .from(statTeams)
    .where(eq(statTeams.id, teamId))
    .limit(1);

  return row?.sessionId ?? null;
}

/** La feuille dont relève ce match de feuille. */
export async function sessionOfSheetMatch(
  executor: Executor,
  matchId: number,
): Promise<number | null> {
  const [row] = await executor
    .select({ sessionId: statMatches.sessionId })
    .from(statMatches)
    .where(eq(statMatches.id, matchId))
    .limit(1);

  return row?.sessionId ?? null;
}

export async function listSessions(
  executor: Executor = db,
  limit = 40,
  /** Superviseur : ses propres feuilles ne lui sont pas listées (SUP-001). */
  excludeForPlayerId?: number,
): Promise<TrackerSessionSummary[]> {
  const all = await executor
    .select()
    .from(statSessions)
    .orderBy(desc(statSessions.localDate), desc(statSessions.id))
    .limit(limit);

  let rows = all;

  if (excludeForPlayerId !== undefined && all.length > 0) {
    const own = await executor
      .select({ sessionId: statParticipants.sessionId })
      .from(statParticipants)
      .where(
        and(
          inArray(
            statParticipants.sessionId,
            all.map((row) => row.id),
          ),
          eq(statParticipants.playerId, excludeForPlayerId),
        ),
      );
    const hidden = new Set(own.map((row) => row.sessionId));
    rows = all.filter((row) => !hidden.has(row.id));
  }

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const participantCounts = await executor
    .select({
      sessionId: statParticipants.sessionId,
      total: sql<number>`count(*)`,
    })
    .from(statParticipants)
    .where(inArray(statParticipants.sessionId, ids))
    .groupBy(statParticipants.sessionId);

  const matchRows = await executor
    .select({ id: statMatches.id, sessionId: statMatches.sessionId })
    .from(statMatches)
    .where(inArray(statMatches.sessionId, ids));

  const eventCounts =
    matchRows.length === 0
      ? []
      : await executor
          .select({
            matchId: statEvents.matchId,
            total: sql<number>`count(*)`,
          })
          .from(statEvents)
          .where(
            inArray(
              statEvents.matchId,
              matchRows.map((row) => row.id),
            ),
          )
          .groupBy(statEvents.matchId);

  const sessionOfMatch = new Map(
    matchRows.map((row) => [row.id, row.sessionId]),
  );
  const eventsPerSession = new Map<number, number>();
  for (const row of eventCounts) {
    const sessionId = sessionOfMatch.get(row.matchId);
    if (sessionId === undefined) continue;
    eventsPerSession.set(
      sessionId,
      (eventsPerSession.get(sessionId) ?? 0) + Number(row.total),
    );
  }

  const participantsPerSession = new Map(
    participantCounts.map((row) => [row.sessionId, Number(row.total)]),
  );
  const matchesPerSession = new Map<number, number>();
  for (const row of matchRows) {
    matchesPerSession.set(
      row.sessionId,
      (matchesPerSession.get(row.sessionId) ?? 0) + 1,
    );
  }

  return rows.map((row) =>
    toSessionSummary(row, {
      participants: participantsPerSession.get(row.id) ?? 0,
      matches: matchesPerSession.get(row.id) ?? 0,
      events: eventsPerSession.get(row.id) ?? 0,
    }),
  );
}

/** Enregistrements d'une feuille, dans l'ordre où ils ont été ajoutés. */
async function readVideos(
  executor: Executor,
  sessionId: number,
): Promise<TrackerVideo[]> {
  const rows = await executor
    .select()
    .from(statSessionVideos)
    .where(eq(statSessionVideos.sessionId, sessionId))
    .orderBy(asc(statSessionVideos.sortOrder), asc(statSessionVideos.id));

  return rows.map((row) => ({ id: row.id, label: row.label, url: row.url }));
}

async function readTeams(
  executor: Executor,
  sessionId: number,
): Promise<TrackerTeamView[]> {
  const rows = await executor
    .select()
    .from(statTeams)
    .where(eq(statTeams.sessionId, sessionId))
    .orderBy(asc(statTeams.teamIndex));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    teamIndex: row.teamIndex,
  }));
}

async function readParticipants(
  executor: Executor,
  sessionId: number,
): Promise<TrackerParticipantView[]> {
  const rows = await executor
    .select({
      id: statParticipants.id,
      teamId: statParticipants.teamId,
      playerId: statParticipants.playerId,
      guestName: statParticipants.guestName,
      shirtNumber: statParticipants.shirtNumber,
      player: publicPlayerColumns,
    })
    .from(statParticipants)
    .leftJoin(players, eq(players.id, statParticipants.playerId))
    .where(eq(statParticipants.sessionId, sessionId))
    .orderBy(asc(statParticipants.id));

  return rows.map((row) => {
    const player = row.player?.id != null ? toPublicPlayer(row.player) : null;
    return {
      id: row.id,
      teamId: row.teamId,
      playerId: row.playerId,
      guestName: row.guestName,
      displayName: player?.displayName ?? row.guestName ?? "Joueur",
      shirtNumber: row.shirtNumber,
      player,
    };
  });
}

async function readMatches(
  executor: Executor,
  sessionId: number,
): Promise<TrackerMatchView[]> {
  const rows = await executor
    .select()
    .from(statMatches)
    .where(eq(statMatches.sessionId, sessionId))
    .orderBy(asc(statMatches.matchOrder));

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    matchOrder: row.matchOrder,
    teamAId: row.teamAId,
    teamBId: row.teamBId,
    status: row.status,
    videoStartMs: row.videoStartMs,
    videoId: row.videoId,
    declaredScoreA: row.declaredScoreA,
    declaredScoreB: row.declaredScoreB,
  }));
}

async function readEvents(
  executor: Executor,
  matchIds: readonly number[],
): Promise<TrackerEventView[]> {
  if (matchIds.length === 0) return [];

  const rows = await executor
    .select()
    .from(statEvents)
    .where(inArray(statEvents.matchId, [...matchIds]))
    .orderBy(
      asc(statEvents.matchId),
      asc(statEvents.clockMs),
      asc(statEvents.id),
    );

  return rows.map((row) => ({
    clientId: row.clientId,
    matchId: row.matchId,
    type: row.type,
    participantId: row.participantId,
    assistParticipantId: row.assistParticipantId,
    teamId: row.teamId,
    clockMs: row.clockMs,
    videoMs: row.videoMs,
  }));
}

/** Feuille complète : un seul aller-retour pour tout l'écran de saisie. */
export async function getSheet(
  sessionId: number,
  executor: Executor = db,
): Promise<TrackerSheet> {
  const [row] = await executor
    .select()
    .from(statSessions)
    .where(eq(statSessions.id, sessionId))
    .limit(1);

  if (!row)
    throw new AppError("NOT_FOUND", "Cette feuille de saisie est introuvable.");

  const [teamViews, participants, matchViews, videos] = await Promise.all([
    readTeams(executor, sessionId),
    readParticipants(executor, sessionId),
    readMatches(executor, sessionId),
    readVideos(executor, sessionId),
  ]);

  const events = await readEvents(
    executor,
    matchViews.map((match) => match.id),
  );

  return {
    session: toSessionSummary(
      row,
      {
        participants: participants.length,
        matches: matchViews.length,
        events: events.length,
      },
      videos,
    ),
    teams: teamViews,
    participants,
    matches: matchViews,
    events,
  };
}

/** Vue domaine des actions, pour l'agrégation. */
function toDomainEvents(events: readonly TrackerEventView[]): TrackerEvent[] {
  return events.map((event) => ({
    clientId: event.clientId,
    matchId: event.matchId,
    type: event.type as TrackerEvent["type"],
    participantId: event.participantId,
    assistParticipantId: event.assistParticipantId,
    teamId: event.teamId,
    clockMs: event.clockMs,
    videoMs: event.videoMs,
  }));
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function createTeams(
  tx: Transaction,
  sessionId: number,
  count: number,
): Promise<number[]> {
  const created: number[] = [];
  for (let index = 0; index < count; index++) {
    const preset = TRACKER_TEAM_PRESETS[index] ?? TRACKER_TEAM_PRESETS[0]!;
    const inserted = await tx.insert(statTeams).values({
      sessionId,
      name: preset.name,
      color: preset.color,
      teamIndex: index,
    });
    created.push(Number(inserted[0].insertId));
  }
  return created;
}

/**
 * Crée une feuille de saisie.
 *
 * Rattachée à une session réservée, elle en reprend le lieu, la date, la
 * division et les joueurs déjà inscrits : la composition est prête avant même
 * d'ouvrir la vidéo. Sans rattachement, elle démarre vide — trois équipes et
 * rien d'autre — parce que c'est le cas d'une session dont on n'a que
 * l'enregistrement.
 */
export async function createSession(
  actor: { userId: number },
  input: TrackerCreateSessionInput,
): Promise<TrackerSheet> {
  const venue = input.venueId
    ? await requireBookableVenue(db, input.venueId)
    : null;

  const sessionId = await db.transaction(async (tx) => {
    /**
     * Le mode d'une feuille libre est celui qu'on lui donne ; celui d'une
     * feuille rattachée est celui de sa session.
     *
     * Forcer « UNO League » sur toute feuille — ce que faisait l'écran —
     * rendait la saisie d'un match SQUAD impossible : trois équipes tirées au
     * sort là où deux clubs s'affrontent, et un barème de récompenses qui
     * n'est pas le sien (SQUAD-005).
     */
    let mode = requireSchedulableMode(input.modeId);
    let localDate = input.localDate;
    let division: Division | null = input.division ?? null;
    let venueId = venue?.slug ?? null;
    let venueName = venue?.name ?? null;
    let slotStartHour = input.slotStartHour;
    let roster: number[] = [];
    /** Équipes déjà formées côté session : reprises telles quelles. */
    let formed: { name: string; playerIds: number[] }[] = [];

    if (input.proposalId != null) {
      const [proposal] = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .limit(1);

      if (!proposal) {
        throw new AppError(
          "NOT_FOUND",
          "Cette session réservée est introuvable.",
        );
      }

      mode = getGameMode(proposal.modeId) ?? mode;
      localDate = proposal.localDate;
      slotStartHour = proposal.slotStartHour;
      division = proposal.division;
      venueId = proposal.venueId;
      venueName = proposal.venueName;

      const participants = await tx
        .select({ playerId: proposalParticipants.playerId })
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId))
        .orderBy(asc(proposalParticipants.joinedAt));

      roster = participants.map((row) => row.playerId);
      formed = await formedTeams(tx, input.proposalId);
    }

    const inserted = await tx.insert(statSessions).values({
      label: input.label,
      localDate,
      slotStartHour,
      venueId,
      venueName,
      modeId: mode.id,
      division,
      status: "draft",
      proposalId: input.proposalId ?? null,
      createdByUserId: actor.userId,
    });

    const id = Number(inserted[0].insertId);

    if (formed.length >= 2) {
      /**
       * La session a déjà ses équipes : un match SQUAD oppose deux clubs, et
       * les redistribuer au sort mélangerait leurs joueurs. On les recopie,
       * noms compris — le relevé doit dire « Les Lions » et non « Équipe A ».
       */
      await copyFormedTeams(tx, id, formed);
    } else {
      const teamIds = await createTeams(
        tx,
        id,
        Math.max(2, mode.teamCount || 3),
      );
      if (roster.length > 0) {
        await seedRoster(tx, id, teamIds, roster);
      }
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "stat_session",
      entityId: id,
      after: { label: input.label, proposalId: input.proposalId ?? null },
    });

    return id;
  });

  return getSheet(sessionId);
}

/** Équipes déjà constituées d'une session, avec leurs joueurs. */
async function formedTeams(
  tx: Transaction,
  proposalId: number,
): Promise<{ name: string; playerIds: number[] }[]> {
  const rows = await tx
    .select({
      teamId: teams.id,
      name: teams.name,
      teamIndex: teams.teamIndex,
      playerId: teamMembers.playerId,
    })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(eq(teams.proposalId, proposalId))
    .orderBy(asc(teams.teamIndex));

  const byTeam = new Map<number, { name: string; playerIds: number[] }>();
  for (const row of rows) {
    const entry = byTeam.get(row.teamId) ?? { name: row.name, playerIds: [] };
    if (row.playerId !== null) entry.playerIds.push(row.playerId);
    byTeam.set(row.teamId, entry);
  }

  return [...byTeam.values()];
}

/** Recopie ces équipes sur la feuille, joueurs compris. */
async function copyFormedTeams(
  tx: Transaction,
  sessionId: number,
  formed: { name: string; playerIds: number[] }[],
): Promise<void> {
  for (const [index, team] of formed.entries()) {
    const preset = TRACKER_TEAM_PRESETS[index] ?? TRACKER_TEAM_PRESETS[0]!;
    const inserted = await tx.insert(statTeams).values({
      sessionId,
      name: team.name,
      color: preset.color,
      teamIndex: index,
    });
    const teamId = Number(inserted[0].insertId);

    if (team.playerIds.length > 0) {
      await tx
        .insert(statParticipants)
        .values(
          team.playerIds.map((playerId) => ({ sessionId, teamId, playerId })),
        );
    }
  }
}

/**
 * Répartit une liste de joueurs en équipes équilibrées.
 *
 * Le tirage est celui des sessions réservées — chapeaux par niveau puis
 * serpentin, ensemencé par l'identifiant de feuille. Deux compositions tirées
 * pour la même feuille sont donc identiques, ce qui rend le tirage vérifiable.
 */
async function seedRoster(
  tx: Transaction,
  sessionId: number,
  teamIds: readonly number[],
  playerIds: readonly number[],
): Promise<void> {
  if (playerIds.length === 0) return;

  const rated = await tx
    .select({
      id: players.id,
      goals: players.goals,
      assists: players.assists,
      defenses: players.defenses,
      saves: players.saves,
      motm: players.motm,
      displayName: players.displayName,
    })
    .from(players)
    .where(inArray(players.id, [...playerIds]));

  if (rated.length === 0) return;

  const { teams: drawn, unassigned } = draftTeams(
    rated.map((player) => ({ id: player.id, rating: rankingScore(player) })),
    teamIds.length,
    sessionId,
    // Une équipe peut compter plus de cinq joueurs sur une feuille : les
    // remplaçants tournent, et les exclure du relevé reviendrait à perdre
    // leurs statistiques. La taille officielle sert de cible, pas de plafond.
    Math.max(TEAM_SIZE, Math.ceil(rated.length / teamIds.length)),
  );

  const rows: { sessionId: number; teamId: number; playerId: number }[] = [];
  drawn.forEach((squad, index) => {
    const teamId = teamIds[index] ?? teamIds[0]!;
    for (const player of squad) {
      rows.push({ sessionId, teamId, playerId: player.id });
    }
  });
  for (const player of unassigned) {
    rows.push({ sessionId, teamId: teamIds[0]!, playerId: player.id });
  }

  if (rows.length > 0) await tx.insert(statParticipants).values(rows);
}

export async function updateSession(
  actor: { userId: number },
  input: TrackerUpdateSessionInput,
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);

    const venue =
      input.venueId != null
        ? await requireBookableVenue(tx, input.venueId)
        : null;

    await tx
      .update(statSessions)
      .set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.localDate !== undefined
          ? { localDate: input.localDate }
          : {}),
        ...(input.slotStartHour !== undefined
          ? { slotStartHour: input.slotStartHour }
          : {}),
        ...(input.division !== undefined
          ? { division: input.division ?? null }
          : {}),
        ...(input.venueId !== undefined
          ? { venueId: venue?.slug ?? null, venueName: venue?.name ?? null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(statSessions.id, input.sessionId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "stat_session",
      entityId: input.sessionId,
      after: {
        updated: Object.keys(input).filter((key) => key !== "sessionId"),
      },
    });
  });

  return getSheet(input.sessionId);
}

export async function removeSession(
  actor: { userId: number },
  sessionId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    assertEditable(session);

    await tx.delete(statSessions).where(eq(statSessions.id, sessionId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "stat_session",
      entityId: sessionId,
      before: { label: session.label },
    });
  });
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

async function requireTeamOfSession(
  tx: Transaction,
  sessionId: number,
  teamId: number,
): Promise<void> {
  const [team] = await tx
    .select({ id: statTeams.id })
    .from(statTeams)
    .where(and(eq(statTeams.id, teamId), eq(statTeams.sessionId, sessionId)))
    .limit(1);

  if (!team) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cette équipe n'appartient pas à la feuille.",
    );
  }
}

/**
 * Le nom et la couleur d'une équipe de la feuille (TRACK-001).
 *
 * Les préréglages — Rouge, Bleu — ne disent rien des chasubles réellement
 * portées : une feuille où « Rouge » joue en noir se relit mal, et ce nom part
 * tel quel sur la page de la séance à la publication.
 */
export async function updateTeam(
  actor: { userId: number },
  input: TrackerUpdateTeamInput,
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const [team] = await tx
      .select({ id: statTeams.id, sessionId: statTeams.sessionId })
      .from(statTeams)
      .where(eq(statTeams.id, input.teamId))
      .limit(1);
    if (!team) throw new AppError("NOT_FOUND", "Cette équipe est introuvable.");

    const session = await lockSession(tx, team.sessionId);
    assertEditable(session);

    await tx
      .update(statTeams)
      .set({ name: input.name.trim(), color: input.color.toLowerCase() })
      .where(eq(statTeams.id, input.teamId));

    await touch(tx, team.sessionId);
    void actor;
    return team.sessionId;
  });

  return getSheet(sessionId);
}

export async function addParticipant(
  actor: { userId: number },
  input: TrackerAddParticipantInput,
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);
    await requireTeamOfSession(tx, input.sessionId, input.teamId);

    if (input.playerId != null) {
      const [existing] = await tx
        .select({ id: statParticipants.id })
        .from(statParticipants)
        .where(
          and(
            eq(statParticipants.sessionId, input.sessionId),
            eq(statParticipants.playerId, input.playerId),
          ),
        )
        .limit(1);

      if (existing) {
        throw new AppError(
          "CONFLICT",
          "Ce joueur figure déjà sur la feuille de cette session.",
        );
      }
    }

    await tx.insert(statParticipants).values({
      sessionId: input.sessionId,
      teamId: input.teamId,
      playerId: input.playerId ?? null,
      guestName: input.guestName ?? null,
      shirtNumber: input.shirtNumber ?? null,
    });

    await touch(tx, input.sessionId);
    void actor;
  });

  return getSheet(input.sessionId);
}

async function touch(tx: Transaction, sessionId: number): Promise<void> {
  await tx
    .update(statSessions)
    .set({ updatedAt: new Date() })
    .where(eq(statSessions.id, sessionId));
}

async function loadParticipant(tx: Transaction, participantId: number) {
  const [row] = await tx
    .select()
    .from(statParticipants)
    .where(eq(statParticipants.id, participantId))
    .limit(1);

  if (!row)
    throw new AppError("NOT_FOUND", "Ce joueur n'est pas sur la feuille.");
  return row;
}

/**
 * Déplace un joueur d'une équipe à l'autre.
 *
 * Autorisé à tout moment, y compris entre deux matchs déjà saisis : les
 * compositions bougent réellement en cours de séance — un joueur arrive en
 * retard, un autre repart plus tôt. Les actions déjà saisies gardent l'équipe
 * qu'elles portaient : le déplacement ne réécrit pas les matchs passés.
 */
export async function moveParticipant(
  actor: { userId: number },
  input: { participantId: number; teamId: number },
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const participant = await loadParticipant(tx, input.participantId);
    const session = await lockSession(tx, participant.sessionId);
    assertEditable(session);
    await requireTeamOfSession(tx, participant.sessionId, input.teamId);

    await tx
      .update(statParticipants)
      .set({ teamId: input.teamId })
      .where(eq(statParticipants.id, input.participantId));

    await touch(tx, participant.sessionId);
    void actor;
    return participant.sessionId;
  });

  return getSheet(sessionId);
}

/**
 * Retire un joueur de la feuille.
 *
 * Refusé dès qu'une action le concerne : supprimer la ligne supprimerait ses
 * actions par cascade, donc des buts déjà comptés au score. Il faut retirer
 * les actions d'abord, ce qui rend la perte visible plutôt que silencieuse.
 */
export async function removeParticipant(
  actor: { userId: number },
  participantId: number,
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const participant = await loadParticipant(tx, participantId);
    const session = await lockSession(tx, participant.sessionId);
    assertEditable(session);

    const [used] = await tx
      .select({ id: statEvents.id })
      .from(statEvents)
      .where(
        sql`${statEvents.participantId} = ${participantId} or ${statEvents.assistParticipantId} = ${participantId}`,
      )
      .limit(1);

    if (used) {
      throw new AppError(
        "RULE_VIOLATION",
        "Des actions sont attribuées à ce joueur : supprimez-les d'abord.",
      );
    }

    await tx
      .delete(statParticipants)
      .where(eq(statParticipants.id, participantId));
    await touch(tx, participant.sessionId);
    void actor;
    return participant.sessionId;
  });

  return getSheet(sessionId);
}

/**
 * Rattache un invité à un compte joueur.
 *
 * Un invité se saisit d'un nom pour ne pas interrompre le visionnage ; c'est
 * ici qu'on lui redonne son identité, sans perdre une seule des actions déjà
 * relevées à son nom.
 */
export async function linkParticipant(
  actor: { userId: number; role?: "user" | "admin" },
  input: { participantId: number; playerId: number },
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const participant = await loadParticipant(tx, input.participantId);
    const session = await lockSession(tx, participant.sessionId);
    // Une feuille publiée reste figée, sauf pour rattacher un invité qui s'est
    // inscrit depuis : la séance publiée reçoit alors ce qu'il y a fait.
    const late = session.status === "published";
    if (late) {
      if (actor.role !== "admin") {
        throw new AppError(
          "FORBIDDEN",
          "Rattacher un invité à une séance publiée revient à l'administration.",
        );
      }
      if (participant.playerId !== null) {
        throw new AppError(
          "RULE_VIOLATION",
          "Seul un invité se rattache à un compte après la publication.",
        );
      }
    } else {
      assertEditable(session);
    }

    const [already] = await tx
      .select({ id: statParticipants.id })
      .from(statParticipants)
      .where(
        and(
          eq(statParticipants.sessionId, participant.sessionId),
          eq(statParticipants.playerId, input.playerId),
        ),
      )
      .limit(1);

    if (already) {
      throw new AppError(
        "CONFLICT",
        "Ce joueur figure déjà sur la feuille : fusionnez les lignes à la main.",
      );
    }

    await tx
      .update(statParticipants)
      .set({ playerId: input.playerId, guestName: null })
      .where(eq(statParticipants.id, input.participantId));

    if (late && session.publishedProposalId !== null) {
      await creditLateLink(
        tx,
        session.publishedProposalId,
        participant.sessionId,
        input.participantId,
        input.playerId,
      );
    }

    await touch(tx, participant.sessionId);
    return participant.sessionId;
  });

  return getSheet(sessionId);
}

/** Un inscrit de la séance publiée qui ne figure sur aucune feuille. */
export interface TrackerAbsentee {
  playerId: number;
  displayName: string;
  hasPaid: boolean;
  /** Ce qu'un remboursement lui rendrait, en UNO ; 0 s'il n'y a rien à rendre. */
  refundableUno: number;
}

/** Les joueurs qui ont joué la séance : ceux des feuilles qui y sont publiées. */
async function playersOnSheets(
  executor: Executor,
  proposalId: number,
): Promise<Set<number>> {
  const rows = await executor
    .select({ playerId: statParticipants.playerId })
    .from(statParticipants)
    .innerJoin(statSessions, eq(statSessions.id, statParticipants.sessionId))
    .where(eq(statSessions.publishedProposalId, proposalId));
  const played = new Set<number>();
  for (const row of rows) if (row.playerId !== null) played.add(row.playerId);

  // Une statistique enregistrée vaut présence, même hors feuille.
  const stats = await executor
    .selectDistinct({ playerId: matchStats.playerId })
    .from(matchStats)
    .innerJoin(matches, eq(matches.id, matchStats.matchId))
    .where(eq(matches.proposalId, proposalId));
  for (const row of stats) played.add(row.playerId);
  return played;
}

/**
 * Les inscrits d'une séance publiée qui n'ont pas joué (TRACK-001).
 *
 * Un remplacement de dernière minute se fait sur la feuille, pas dans la
 * séance : celui qui s'était inscrit puis n'est pas venu y reste inscrit. La
 * feuille, elle, dit qui a joué — c'est elle qui les désigne.
 */
export async function sheetAbsentees(
  executor: Executor,
  sessionId: number,
): Promise<TrackerAbsentee[]> {
  const [session] = await executor
    .select({ proposalId: statSessions.publishedProposalId })
    .from(statSessions)
    .where(eq(statSessions.id, sessionId))
    .limit(1);
  if (!session?.proposalId) return [];

  const [proposal] = await executor
    .select({ priceUno: proposals.priceUno })
    .from(proposals)
    .where(eq(proposals.id, session.proposalId))
    .limit(1);
  const played = await playersOnSheets(executor, session.proposalId);

  const seats = await executor
    .select({
      playerId: proposalParticipants.playerId,
      hasPaid: proposalParticipants.hasPaid,
      displayName: players.displayName,
    })
    .from(proposalParticipants)
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(eq(proposalParticipants.proposalId, session.proposalId))
    .orderBy(asc(players.displayName));

  return seats
    .filter((seat) => !played.has(seat.playerId))
    .map((seat) => ({
      ...seat,
      refundableUno: seat.hasPaid ? (proposal?.priceUno ?? 0) : 0,
    }));
}

/**
 * Retire d'une séance publiée un inscrit qui n'a pas joué (TRACK-001).
 *
 * Remplacé au dernier moment, il ne doit plus voir la séance comme la sienne :
 * elle quitte son historique, ses vidéos lui sont fermées, et la clôture est
 * défaite pour lui — la séance jouée qu'elle lui avait comptée, et la
 * récompense de participation si le mode en versait une. Celle-ci n'est
 * reprise que si son solde le permet : la lui laisser vaut mieux que de
 * bloquer le retrait.
 *
 * Sa place payée n'est remboursée que sur demande : un forfait de dernière
 * minute n'appelle pas toujours de remboursement, c'est à l'administration
 * d'en juger.
 *
 * Refusé pour qui figure sur une feuille ou a des statistiques : il a joué.
 */
export async function removeAbsentee(
  actor: { userId: number },
  input: { sessionId: number; playerId: number; refund: boolean },
): Promise<{ refundedUno: number; rewardReversedUno: number }> {
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (
      session.status !== "published" ||
      session.publishedProposalId === null
    ) {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette feuille n'est pas publiée : la composition de la séance se gère depuis la séance elle-même.",
      );
    }

    const [proposal] = await tx
      .select()
      .from(proposals)
      .where(eq(proposals.id, session.publishedProposalId))
      .for("update");
    if (!proposal) throw new AppError("NOT_FOUND", "Session introuvable.");

    const [seat] = await tx
      .select({
        id: proposalParticipants.id,
        hasPaid: proposalParticipants.hasPaid,
        paymentId: proposalParticipants.paymentId,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposal.id),
          eq(proposalParticipants.playerId, input.playerId),
        ),
      )
      .limit(1);
    if (!seat) {
      throw new AppError(
        "NOT_FOUND",
        "Ce joueur n'est plus inscrit à cette session.",
      );
    }

    if ((await playersOnSheets(tx, proposal.id)).has(input.playerId)) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce joueur figure sur la feuille de match : il a joué.",
      );
    }

    const refundedUno =
      input.refund && seat.hasPaid && proposal.priceUno > 0
        ? await refundSeat(tx, proposal, {
            playerId: input.playerId,
            paymentId: seat.paymentId,
          })
        : 0;

    // La récompense de participation versée à la clôture, s'il y en a eu une.
    let rewardReversedUno = 0;
    const [reward] = await tx
      .select({ amount: ledgerTransactions.amount })
      .from(ledgerTransactions)
      .where(
        eq(
          ledgerTransactions.idempotencyKey,
          `reward:session:${proposal.id}:participation:${input.playerId}`,
        ),
      )
      .limit(1);
    if (reward && reward.amount > 0) {
      const [wallet] = await tx
        .select({ unoPoints: players.unoPoints })
        .from(players)
        .where(eq(players.id, input.playerId))
        .limit(1);
      if ((wallet?.unoPoints ?? 0) >= reward.amount) {
        await debit(tx, {
          playerId: input.playerId,
          amount: reward.amount,
          type: "admin_debit",
          description: ecriture(
            "Récompense de participation reprise — absent de la session du {jour}",
            { jour: proposal.localDate },
          ),
          referenceType: "proposal",
          referenceId: proposal.id,
          idempotencyKey: `reward:session:${proposal.id}:participation:${input.playerId}:reversal`,
        });
        rewardReversedUno = reward.amount;
      }
    }

    // La clôture lui a compté la séance jouée parce que sa place était réglée.
    if (seat.hasPaid && proposal.status === "completed") {
      await tx
        .update(players)
        .set({ matchesPlayed: sql`GREATEST(0, ${players.matchesPlayed} - 1)` })
        .where(eq(players.id, input.playerId));
    }

    await tx
      .delete(proposalParticipants)
      .where(eq(proposalParticipants.id, seat.id));
    await recountSeats(tx, proposal.id);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.participant.remove",
      entityType: "proposal",
      entityId: proposal.id,
      before: { playerId: input.playerId, hasPaid: seat.hasPaid },
      after: { absentee: true, refundedUno, rewardReversedUno },
    });

    return { refundedUno, rewardReversedUno };
  });
}

/**
 * Un invité rattaché à son compte après la publication (TRACK-001) : la
 * séance publiée reçoit ce qu'il y a fait, comme s'il avait été rattaché
 * avant — sa place dans son équipe, ses statistiques de chaque match, la
 * séance dans son historique, la séance jouée et l'XP, et les compteurs de
 * carrière si le mode les fait avancer. L'homme du match et les distinctions,
 * figés à la clôture, ne sont pas refaits.
 */
async function creditLateLink(
  tx: Transaction,
  proposalId: number,
  sheetId: number,
  participantId: number,
  playerId: number,
): Promise<void> {
  const already = await tx
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, playerId),
      ),
    )
    .limit(1);
  if (already.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Ce joueur figure déjà dans la séance publiée : ses statistiques y sont déjà.",
    );
  }

  const sheet = await getSheet(sheetId, tx);
  const participant = sheet.participants.find((p) => p.id === participantId);
  if (!participant) return;

  // Son équipe : celle de la séance qui porte le même rang.
  const teamIndex = sheet.teams.find(
    (team) => team.id === participant.teamId,
  )?.teamIndex;
  const [team] = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.proposalId, proposalId),
        eq(teams.teamIndex, teamIndex ?? -1),
      ),
    )
    .orderBy(desc(teams.id))
    .limit(1);
  if (team) await tx.insert(teamMembers).values({ teamId: team.id, playerId });

  // Ses statistiques, match par match : les matchs publiés suivent l'ordre des
  // matchs terminés de la feuille.
  const durationMs = trackerMatchDurationMs(sheet.session.modeId);
  const finished = sheet.matches.filter((match) => match.status === "finished");
  const aggregate = aggregateSession(
    finished.map((match) => ({
      id: match.id,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      durationMs,
    })),
    toDomainEvents(sheet.events),
  );
  const published = (
    await tx
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.proposalId, proposalId))
      .orderBy(desc(matches.id))
      .limit(finished.length)
  ).reverse();

  const totals = { goals: 0, assists: 0, defenses: 0, saves: 0 };
  for (const [index, match] of finished.entries()) {
    const line = aggregate.matches
      .find((item) => item.matchId === match.id)
      ?.participants.find((item) => item.participantId === participantId);
    const target = published[index];
    if (!line || !target) continue;
    await tx.insert(matchStats).values({
      matchId: target.id,
      playerId,
      goals: line.goals,
      assists: line.assists,
      defenses: line.defenses,
      saves: line.saves,
    });
    totals.goals += line.goals;
    totals.assists += line.assists;
    totals.defenses += line.defenses;
    totals.saves += line.saves;
  }

  // La séance dans son historique, et les compteurs de la séance.
  await enrolSheetPlayers(tx, proposalId, sheet);

  // Ce que la clôture a donné aux autres joueurs, selon le mode.
  const effects = getGameMode(sheet.session.modeId)?.effects;
  await tx
    .update(players)
    .set({
      matchesPlayed: sql`${players.matchesPlayed} + 1`,
      ...(effects?.careerStats
        ? {
            goals: sql`${players.goals} + ${totals.goals}`,
            assists: sql`${players.assists} + ${totals.assists}`,
            defenses: sql`${players.defenses} + ${totals.defenses}`,
            saves: sql`${players.saves} + ${totals.saves}`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(players.id, playerId));
  if (effects?.xp) {
    await awardXp(
      tx,
      playerId,
      XP_AWARDS.sessionPlayed +
        totals.goals * XP_AWARDS.goal +
        totals.assists * XP_AWARDS.assist +
        totals.defenses * XP_AWARDS.defense +
        totals.saves * XP_AWARDS.save,
    );
  }
}

/**
 * Recompose entièrement les équipes par tirage équilibré.
 *
 * Refusé dès qu'une action a été saisie : les actions portent l'équipe de leur
 * auteur, et rebattre les cartes après coup rendrait la feuille incohérente
 * avec ce qui a été relevé.
 */
export async function draftRoster(
  actor: { userId: number },
  input: { sessionId: number; playerIds: number[] },
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);
    await assertNoEvents(tx, input.sessionId, "draw");

    const teamIds = (
      await tx
        .select({ id: statTeams.id })
        .from(statTeams)
        .where(eq(statTeams.sessionId, input.sessionId))
        .orderBy(asc(statTeams.teamIndex))
    ).map((row) => row.id);

    await tx
      .delete(statParticipants)
      .where(eq(statParticipants.sessionId, input.sessionId));

    await seedRoster(tx, input.sessionId, teamIds, input.playerIds);
    await touch(tx, input.sessionId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "stat_session",
      entityId: input.sessionId,
      after: { drafted: input.playerIds.length },
    });
  });

  return getSheet(input.sessionId);
}

async function assertNoEvents(
  tx: Transaction,
  sessionId: number,
  /** Le geste refusé : le message le nomme en toutes lettres, pour se traduire. */
  action: "draw" | "reuse",
): Promise<void> {
  const [used] = await tx
    .select({ id: statEvents.id })
    .from(statEvents)
    .innerJoin(statMatches, eq(statMatches.id, statEvents.matchId))
    .where(eq(statMatches.sessionId, sessionId))
    .limit(1);

  if (used) {
    throw new AppError(
      "RULE_VIOLATION",
      action === "draw"
        ? "Le tirage des équipes n'est plus possible : des actions ont déjà été saisies."
        : "Reprendre une composition n'est plus possible : des actions ont déjà été saisies.",
    );
  }
}

/**
 * Reprend la composition d'une feuille précédente.
 *
 * D'une session à l'autre, la moitié des joueurs revient. Repartir de la
 * dernière composition et n'ajuster que les entrants est le geste le plus
 * rapide qui existe pour préparer une feuille — bien plus que de rechercher
 * quinze joueurs un par un.
 */
export async function copyRoster(
  actor: { userId: number },
  input: { sessionId: number; fromSessionId: number },
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);
    await assertNoEvents(tx, input.sessionId, "reuse");

    const sourceTeams = await tx
      .select()
      .from(statTeams)
      .where(eq(statTeams.sessionId, input.fromSessionId))
      .orderBy(asc(statTeams.teamIndex));

    const targetTeams = await tx
      .select()
      .from(statTeams)
      .where(eq(statTeams.sessionId, input.sessionId))
      .orderBy(asc(statTeams.teamIndex));

    if (sourceTeams.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "Cette feuille source n'a aucune équipe.",
      );
    }

    const sourceParticipants = await tx
      .select()
      .from(statParticipants)
      .where(eq(statParticipants.sessionId, input.fromSessionId))
      .orderBy(asc(statParticipants.id));

    await tx
      .delete(statParticipants)
      .where(eq(statParticipants.sessionId, input.sessionId));

    const byIndex = new Map(
      sourceTeams.map((team) => [team.id, team.teamIndex]),
    );
    const rows = sourceParticipants
      .map((participant) => {
        const index = byIndex.get(participant.teamId) ?? 0;
        const target = targetTeams[index] ?? targetTeams[0];
        if (!target) return null;
        return {
          sessionId: input.sessionId,
          teamId: target.id,
          playerId: participant.playerId,
          guestName: participant.guestName,
          shirtNumber: participant.shirtNumber,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) await tx.insert(statParticipants).values(rows);
    await touch(tx, input.sessionId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "stat_session",
      entityId: input.sessionId,
      after: { copiedFrom: input.fromSessionId, players: rows.length },
    });
  });

  return getSheet(input.sessionId);
}

// ---------------------------------------------------------------------------
// Matchs
// ---------------------------------------------------------------------------

export async function addMatch(
  actor: { userId: number },
  input: { sessionId: number; teamAId: number; teamBId: number },
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);

    if (input.teamAId === input.teamBId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Une équipe ne peut pas se rencontrer elle-même.",
      );
    }
    await requireTeamOfSession(tx, input.sessionId, input.teamAId);
    await requireTeamOfSession(tx, input.sessionId, input.teamBId);

    const existing = await tx
      .select({ matchOrder: statMatches.matchOrder })
      .from(statMatches)
      .where(eq(statMatches.sessionId, input.sessionId));

    const nextOrder =
      existing.reduce((max, row) => Math.max(max, row.matchOrder), 0) + 1;

    await tx.insert(statMatches).values({
      sessionId: input.sessionId,
      matchOrder: nextOrder,
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      status: "pending",
    });

    await touch(tx, input.sessionId);
    void actor;
  });

  return getSheet(input.sessionId);
}

export async function updateMatch(
  actor: { userId: number },
  input: {
    matchId: number;
    status?: "pending" | "playing" | "finished";
    videoStartMs?: number | null | undefined;
    /**
     * Enregistrement d'où le coup d'envoi a été relevé. Il accompagne
     * `videoStartMs` : une position sans son enregistrement est ambiguë dès
     * qu'une feuille en compte deux.
     */
    videoId?: number | null | undefined;
    declaredScoreA?: number | null | undefined;
    declaredScoreB?: number | null | undefined;
  },
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(statMatches)
      .where(eq(statMatches.id, input.matchId))
      .limit(1);

    if (!match) throw new AppError("NOT_FOUND", "Ce match est introuvable.");

    const session = await lockSession(tx, match.sessionId);
    assertEditable(session);

    await tx
      .update(statMatches)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.videoStartMs !== undefined
          ? { videoStartMs: input.videoStartMs ?? null }
          : {}),
        ...(input.videoId !== undefined
          ? { videoId: input.videoId ?? null }
          : {}),
        ...(input.declaredScoreA !== undefined
          ? { declaredScoreA: input.declaredScoreA ?? null }
          : {}),
        ...(input.declaredScoreB !== undefined
          ? { declaredScoreB: input.declaredScoreB ?? null }
          : {}),
      })
      .where(eq(statMatches.id, input.matchId));

    await touch(tx, match.sessionId);
    void actor;
    return match.sessionId;
  });

  return getSheet(sessionId);
}

/**
 * Rattache un enregistrement à une feuille (TRACK-001).
 *
 * Sans adresse, l'entrée n'est qu'un repère nommé — « 1re heure » — que
 * l'utilisateur ré-associe à son fichier local à chaque visite. C'est
 * volontaire : un fichier de plusieurs gigaoctets n'a rien à faire sur un
 * serveur, mais un match doit pouvoir dire dans lequel il a été relevé.
 */
export async function addVideo(
  actor: { userId: number },
  input: { sessionId: number; label: string; url?: string | null | undefined },
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);

    const existing = await tx
      .select({ total: sql<number>`count(*)` })
      .from(statSessionVideos)
      .where(eq(statSessionVideos.sessionId, input.sessionId));

    const count = Number(existing[0]?.total ?? 0);
    if (count >= LIMITS.videosPerSession) {
      throw new AppError(
        "RULE_VIOLATION",
        gabarit(
          "Une feuille ne peut pas porter plus de {limite} enregistrements.",
          { limite: LIMITS.videosPerSession },
        ),
      );
    }

    const url = input.url?.trim() ? input.url.trim() : null;
    if (url !== null && parseVideoUrl(url) === null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Cette adresse n'est pas exploitable. Collez le lien complet de la vidéo.",
      );
    }

    // La saisie relève des positions au millième et fait revenir la vidéo en
    // arrière : elle a besoin d'un **fichier**. Une page YouTube ou Vimeo ne
    // se pilote pas ainsi, et l'accepter ici mènerait à un lecteur muet dont
    // personne ne comprendrait pourquoi il ne répond pas.
    if (url !== null && !isDirectVideoUrl(url)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "YouTube et Vimeo ne peuvent pas être pilotés image par image. " +
          "Utilisez un lien direct vers le fichier vidéo, ou ouvrez le fichier " +
          "depuis votre disque.",
      );
    }

    await tx.insert(statSessionVideos).values({
      sessionId: input.sessionId,
      label: input.label.trim(),
      url,
      sortOrder: count,
    });

    await touch(tx, input.sessionId);
    void actor;
  });

  return getSheet(input.sessionId);
}

/** Détache un enregistrement. Les matchs relevés dedans perdent leur repère. */
export async function removeVideo(
  actor: { userId: number },
  input: { sessionId: number; videoId: number },
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);

    await tx
      .delete(statSessionVideos)
      .where(
        and(
          eq(statSessionVideos.id, input.videoId),
          eq(statSessionVideos.sessionId, input.sessionId),
        ),
      );

    await touch(tx, input.sessionId);
    void actor;
  });

  return getSheet(input.sessionId);
}

export async function removeMatch(
  actor: { userId: number },
  matchId: number,
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(statMatches)
      .where(eq(statMatches.id, matchId))
      .limit(1);

    if (!match) throw new AppError("NOT_FOUND", "Ce match est introuvable.");

    const session = await lockSession(tx, match.sessionId);
    assertEditable(session);

    const [used] = await tx
      .select({ id: statEvents.id })
      .from(statEvents)
      .where(eq(statEvents.matchId, matchId))
      .limit(1);

    if (used) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce match porte des actions saisies : supprimez-les d'abord.",
      );
    }

    await tx.delete(statMatches).where(eq(statMatches.id, matchId));
    await touch(tx, match.sessionId);
    void actor;
    return match.sessionId;
  });

  return getSheet(sessionId);
}

/**
 * Affiche suivante suggérée, d'après la règle du terrain (MATCH-001).
 *
 * « Le vainqueur reste ; à égalité, l'équipe entrante reste. » Le score du
 * dernier match n'est pas relu d'une saisie : il est déduit des buts relevés,
 * comme partout ailleurs.
 */
export function suggestNextPairing(sheet: TrackerSheet): {
  teamAId: number;
  teamBId: number;
} | null {
  const teamIds = sheet.teams.map((team) => team.id);
  const played = sheet.matches.filter((match) => match.status === "finished");
  const last = played[played.length - 1] ?? null;

  if (!last) return nextPairing(teamIds, null);

  const aggregate = aggregateSession(
    [{ id: last.id, teamAId: last.teamAId, teamBId: last.teamBId }],
    toDomainEvents(sheet.events),
  ).matches[0];

  return nextPairing(teamIds, {
    teamAId: last.teamAId,
    teamBId: last.teamBId,
    scoreA: aggregate?.scoreA ?? 0,
    scoreB: aggregate?.scoreB ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Synchronisation des actions
// ---------------------------------------------------------------------------

/**
 * Enregistre un lot d'actions saisies.
 *
 * L'écran de saisie travaille en local et pousse par lots : la saisie ne
 * dépend jamais du réseau, ce qui est la seule façon de tenir le rythme d'un
 * match. Les écritures sont idempotentes par `clientId` — une file d'attente
 * rejouée après une coupure n'écrit rien deux fois, et supprimer une action
 * déjà supprimée n'est pas une erreur.
 */
export async function syncEvents(
  actor: { userId: number },
  input: TrackerSyncInput,
): Promise<TrackerSheet> {
  await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    assertEditable(session);

    const ownMatches = await tx
      .select({
        id: statMatches.id,
        teamAId: statMatches.teamAId,
        teamBId: statMatches.teamBId,
      })
      .from(statMatches)
      .where(eq(statMatches.sessionId, input.sessionId));

    const matchIds = new Set(ownMatches.map((row) => row.id));
    const matchById = new Map(ownMatches.map((row) => [row.id, row]));

    const ownParticipants = await tx
      .select({ id: statParticipants.id })
      .from(statParticipants)
      .where(eq(statParticipants.sessionId, input.sessionId));

    const participantIds = new Set(ownParticipants.map((row) => row.id));

    for (const event of input.upserts) {
      const match = matchById.get(event.matchId);
      if (!match) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Une action désigne un match qui n'appartient pas à cette feuille.",
        );
      }
      if (!participantIds.has(event.participantId)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Une action désigne un joueur absent de la feuille.",
        );
      }
      if (
        event.assistParticipantId != null &&
        !participantIds.has(event.assistParticipantId)
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Une passe décisive désigne un joueur absent de la feuille.",
        );
      }
      if (event.teamId !== match.teamAId && event.teamId !== match.teamBId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Une action désigne une équipe qui ne dispute pas ce match.",
        );
      }
      if (event.type !== "goal" && event.assistParticipantId != null) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Seul un but peut porter une passe décisive.",
        );
      }
      if (event.assistParticipantId === event.participantId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Un joueur ne peut pas se donner la passe décisive.",
        );
      }
    }

    for (const event of input.upserts) {
      await tx
        .insert(statEvents)
        .values({
          clientId: event.clientId,
          matchId: event.matchId,
          type: event.type,
          participantId: event.participantId,
          assistParticipantId: event.assistParticipantId ?? null,
          teamId: event.teamId,
          clockMs: event.clockMs,
          videoMs: event.videoMs ?? null,
        })
        // Une action peut être corrigée après coup — le passeur oublié, la
        // minute rectifiée. La clé restant la même, la correction remplace la
        // ligne au lieu d'en ajouter une seconde.
        .onDuplicateKeyUpdate({
          set: {
            matchId: event.matchId,
            type: event.type,
            participantId: event.participantId,
            assistParticipantId: event.assistParticipantId ?? null,
            teamId: event.teamId,
            clockMs: event.clockMs,
            videoMs: event.videoMs ?? null,
          },
        });
    }

    if (input.deletions.length > 0 && matchIds.size > 0) {
      await tx
        .delete(statEvents)
        .where(
          and(
            inArray(statEvents.clientId, input.deletions),
            inArray(statEvents.matchId, [...matchIds]),
          ),
        );
    }

    await touch(tx, input.sessionId);
    void actor;
  });

  return getSheet(input.sessionId);
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

export interface TrackerPublishResult {
  proposalId: number;
  matchesRecorded: number;
  promoted: number;
  relegated: number;
  motmPlayerId: number | null;
  rewardedPlayers: number;
  /** Une vidéo de la feuille est en ligne sur la séance (les joueurs en sont prévenus). */
  videosOnline: boolean;
}

/**
 * Publie une feuille vers le classement officiel.
 *
 * La feuille est convertie en session réservée — équipes, compositions,
 * matchs — puis poussée dans `applyRecordSession`, exactement comme une
 * session saisie depuis la console d'administration. Rien n'est recalculé ici :
 * l'XP, les distinctions, l'homme du match, les montées et les descentes
 * viennent du même code que le reste de la ligue, sans quoi deux chemins de
 * saisie finiraient par donner deux classements différents.
 *
 * Publier deux fois est refusé, et le verrou posé sur la feuille sérialise
 * deux tentatives simultanées : la seconde voit la première publiée.
 */
export async function publishSession(
  actor: { userId: number; playerId: number; role: "user" | "admin" },
  input: TrackerPublishInput,
): Promise<TrackerPublishResult> {
  const result = await db.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (session.status === "published") {
      throw new AppError("CONFLICT", "Cette feuille est déjà publiée.");
    }

    const sheet = await getSheet(input.sessionId, tx);

    // SUP-001 : un superviseur ne publie pas une feuille où il figure.
    //
    // C'est ici que la question se pose, et pas à la saisie : relever des
    // actions ne décide de rien, publier décide des distinctions, des UNO et
    // des divisions. Le contrôle porte sur la feuille elle-même plutôt que sur
    // la session visée, car une publication peut créer la session : à ce
    // moment-là, il n'y aurait encore aucun participant à interroger.
    if (actor.role !== "admin") {
      const inSheet = sheet.participants.some(
        (participant) => participant.playerId === actor.playerId,
      );
      if (inSheet) {
        throw new AppError(
          "RULE_VIOLATION",
          "Vous figurez sur cette feuille : sa publication revient à un autre superviseur.",
        );
      }
    }
    const blockers = publicationBlockers(sheet).filter(
      (warning) => warning.level === "blocking",
    );
    if (blockers.length > 0) {
      // Le gabarit plutôt que le texte : il se traduit, le texte non.
      throw new AppError("RULE_VIOLATION", blockers[0]!.modele);
    }

    const proposalId = await resolveTargetProposal(tx, actor, session, sheet);

    // --- Enregistrements --------------------------------------------------
    //
    // La vidéo qui a servi à compter suit la session publiée : c'est la seule
    // qui ait un sens à côté du résultat, et personne n'a à la recoller à la
    // main. Seules celles qui ont une adresse voyagent — un fichier local n'en
    // a pas, et un repère sans vidéo n'apprendrait rien à un joueur.
    //
    // Chaque action relevée porte l'instant de la vidéo où elle a été saisie :
    // la feuille est déjà le « rapport » de la séance. Ses coups d'envoi, buts
    // et arrêts deviennent les moments-clés de la vidéo, sur lesquels un
    // joueur touche pour revoir l'action ; un second angle calé les reçoit
    // décalés.
    const attached = await tx
      .select({
        id: sessionVideos.id,
        url: sessionVideos.url,
        moments: sessionVideos.moments,
      })
      .from(sessionVideos)
      .where(eq(sessionVideos.proposalId, proposalId));
    const already = new Map(attached.map((row) => [row.url, row]));
    let videosOnline = false;

    for (const video of sheet.session.videos) {
      if (video.url === null) continue;
      const moments = trackerMoments(sheet, video.id, input.angles ?? null);
      // Republier une feuille corrigée ne doit pas empiler deux fois la même
      // vidéo sur la session : la vidéo déjà là reçoit seulement les moments,
      // si personne ne lui en a encore donné.
      const existing = already.get(video.url);
      if (existing) {
        const had = Array.isArray(existing.moments) && existing.moments.length;
        if (!had && moments.length > 0) {
          await tx
            .update(sessionVideos)
            .set({ moments })
            .where(eq(sessionVideos.id, existing.id));
        }
        videosOnline = true;
        continue;
      }
      // La limite de la session s'applique à la copie comme à un ajout à la
      // main. Elle **n'empêche pas de publier** pour autant : la feuille
      // décide du classement, une vidéo de trop n'est pas un motif de refus.
      if (already.size >= LIMITS.videosPerSession) break;

      const inserted = await tx.insert(sessionVideos).values({
        proposalId,
        url: video.url,
        label: video.label,
        provider: parseVideoUrl(video.url)?.provider ?? "other",
        addedByPlayerId: actor.playerId,
        moments,
      });
      already.set(video.url, {
        id: Number(inserted[0].insertId),
        url: video.url,
        moments,
      });
      videosOnline = true;
    }

    // --- Équipes et compositions ------------------------------------------
    const trackerToProposalTeam = new Map<number, number>();
    for (const team of sheet.teams) {
      const inserted = await tx.insert(teams).values({
        proposalId,
        name: team.name,
        teamIndex: team.teamIndex,
      });
      trackerToProposalTeam.set(team.id, Number(inserted[0].insertId));
    }

    const participantToPlayer = new Map<number, number>();
    const memberRows: { teamId: number; playerId: number }[] = [];
    for (const participant of sheet.participants) {
      if (participant.playerId === null) continue;
      participantToPlayer.set(participant.id, participant.playerId);
      const teamId = trackerToProposalTeam.get(participant.teamId);
      if (teamId !== undefined) {
        memberRows.push({ teamId, playerId: participant.playerId });
      }
    }
    if (memberRows.length > 0) await tx.insert(teamMembers).values(memberRows);

    // --- Matchs ------------------------------------------------------------
    const durationMs = trackerMatchDurationMs(sheet.session.modeId);
    const aggregate = aggregateSession(
      sheet.matches
        .filter((match) => match.status === "finished")
        .map((match) => ({
          id: match.id,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          durationMs,
        })),
      toDomainEvents(sheet.events),
    );

    const recorded: {
      matchId: number;
      scoreA: number;
      scoreB: number;
      stats: {
        playerId: number;
        goals: number;
        assists: number;
        defenses: number;
        saves: number;
      }[];
    }[] = [];

    let matchOrder = 0;
    for (const match of sheet.matches) {
      if (match.status !== "finished") continue;
      matchOrder++;

      const teamAId = trackerToProposalTeam.get(match.teamAId);
      const teamBId = trackerToProposalTeam.get(match.teamBId);
      if (teamAId === undefined || teamBId === undefined) continue;

      const inserted = await tx.insert(matches).values({
        proposalId,
        teamAId,
        teamBId,
        matchOrder,
        status: "scheduled",
      });

      const summary = aggregate.matches.find(
        (item) => item.matchId === match.id,
      );

      recorded.push({
        matchId: Number(inserted[0].insertId),
        scoreA: summary?.scoreA ?? 0,
        scoreB: summary?.scoreB ?? 0,
        stats: (summary?.participants ?? [])
          .map((line) => {
            const playerId = participantToPlayer.get(line.participantId);
            if (playerId === undefined) return null;
            return {
              playerId,
              goals: line.goals,
              assists: line.assists,
              defenses: line.defenses,
              saves: line.saves,
            };
          })
          .filter((line): line is NonNullable<typeof line> => line !== null),
      });
    }

    const outcome = await applyRecordSession(
      tx,
      actor,
      { proposalId, matches: recorded, complete: true },
      { awardUno: input.awardUno },
    );

    await tx
      .update(statSessions)
      .set({
        status: "published",
        publishedProposalId: proposalId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(statSessions.id, input.sessionId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "stat_session",
      entityId: input.sessionId,
      after: {
        proposalId,
        matches: recorded.length,
        awardUno: input.awardUno,
      },
    });

    return {
      proposalId,
      matchesRecorded: outcome.matchesRecorded,
      promoted: outcome.completion?.promoted ?? 0,
      relegated: outcome.completion?.relegated ?? 0,
      motmPlayerId: outcome.completion?.motmPlayerId ?? null,
      rewardedPlayers: outcome.completion?.rewardedPlayers ?? 0,
      videosOnline,
    };
  });

  // Les joueurs apprennent que la vidéo de leur match est en ligne — une fois
  // par séance, quel que soit le chemin par lequel elle est arrivée.
  if (result.videosOnline) await announceVideo(result.proposalId);

  await recordAdminEvent(
    {
      type: "proposal.completed",
      body:
        `Feuille de saisie #${input.sessionId} publiée : ` +
        `${result.matchesRecorded} match(s), ${result.promoted} montée(s), ` +
        `${result.relegated} descente(s).`,
      entityType: "proposal",
      entityId: result.proposalId,
      key: `stat-session:${input.sessionId}:published`,
    },
    db,
  );

  return result;
}

/**
 * Session de destination : celle à laquelle la feuille est rattachée, ou une
 * session créée pour l'occasion.
 *
 * Le cas « créée pour l'occasion » est celui d'une séance jouée hors du
 * parcours de réservation — encaissée au terrain, ou saisie a posteriori pour
 * rattraper un historique. Elle rejoint alors le calendrier comme une session
 * terminée normale, avec son podium et ses résultats : c'est ce que les
 * joueurs vont consulter.
 */
/**
 * Inscrit à la session les joueurs de la feuille qui n'y figuraient pas.
 *
 * Une feuille rattachée reprend les inscrits de la session, mais on y ajoute
 * ceux qui ont réellement joué : un remplaçant venu au pied levé, quelqu'un
 * qui a pris la place d'un absent. Sans cette inscription, la publication leur
 * comptait bien leurs buts — le relevé se lit sur la feuille — mais la session
 * restait absente de leur historique, ne comptait pas dans leurs séances
 * jouées, et les laissait donc hors des ratios et du classement.
 *
 * La place est marquée réglée, comme sur une feuille libre : la feuille dit
 * qu'ils ont joué, et l'encaissement de leur place — s'il a eu lieu — s'est
 * fait hors de l'application. C'est aussi ce qui leur vaut la récompense de
 * participation, au même titre que les autres joueurs de la séance.
 */
async function enrolSheetPlayers(
  tx: Transaction,
  proposalId: number,
  sheet: TrackerSheet,
): Promise<void> {
  const onSheet = new Set(
    sheet.participants
      .map((participant) => participant.playerId)
      .filter((playerId): playerId is number => playerId !== null),
  );
  if (onSheet.size === 0) return;

  const registered = await tx
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));

  const known = new Set(registered.map((row) => row.playerId));
  const missing = [...onSheet].filter((playerId) => !known.has(playerId));

  if (missing.length > 0) {
    await tx
      .insert(proposalParticipants)
      .values(
        missing.map((playerId) => ({ proposalId, playerId, hasPaid: true })),
      );
  }

  // Les compteurs de la session suivent : ils servent d'affichage partout, et
  // une session à quinze inscrits qui en a fait jouer seize se lirait faux.
  await recountSeats(tx, proposalId);
}

/** Recompte les inscrits et les places réglées d'une séance. */
async function recountSeats(tx: Transaction, proposalId: number) {
  const [counted] = await tx
    .select({
      total: sql<number>`COUNT(*)`,
      paid: sql<number>`SUM(CASE WHEN ${proposalParticipants.hasPaid} THEN 1 ELSE 0 END)`,
    })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));

  const total = Number(counted?.total ?? 0);
  const paid = Number(counted?.paid ?? 0);

  await tx
    .update(proposals)
    .set({
      participantCount: total,
      paidCount: paid,
      paymentComplete: total > 0 && paid === total,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));
}

async function resolveTargetProposal(
  tx: Transaction,
  actor: { userId: number; playerId: number },
  session: StatSessionRow,
  sheet: TrackerSheet,
): Promise<number> {
  if (session.proposalId !== null) {
    const [existing] = await tx
      .select()
      .from(proposals)
      .where(eq(proposals.id, session.proposalId))
      .for("update");

    if (!existing) {
      throw new AppError(
        "NOT_FOUND",
        "La session réservée rattachée à cette feuille n'existe plus.",
      );
    }
    if (existing.status !== "session") {
      throw new AppError(
        "RULE_VIOLATION",
        "La session rattachée n'est pas dans l'état « confirmée » : " +
          "elle ne peut pas recevoir de feuille.",
      );
    }

    // Une session confirmée porte déjà un tirage d'équipes et un premier
    // match d'amorce. Ils sont remplacés par ce qui a réellement été joué ;
    // c'est sans risque tant qu'aucun match n'a été validé, ce que la
    // transition d'état interdit de toute façon après coup.
    const [validated] = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.proposalId, existing.id),
          eq(matches.status, "validated"),
        ),
      )
      .limit(1);

    if (validated) {
      throw new AppError(
        "CONFLICT",
        "Cette session a déjà des matchs validés : sa feuille est close.",
      );
    }

    await tx.delete(matches).where(eq(matches.proposalId, existing.id));
    await tx.delete(teams).where(eq(teams.proposalId, existing.id));

    await enrolSheetPlayers(tx, existing.id, sheet);

    return existing.id;
  }

  const mode = requireSchedulableMode(session.modeId);
  const timezone = "Europe/Brussels";
  const slot = findSlot(mode, session.slotStartHour);
  const label =
    slot?.label ??
    `${String(session.slotStartHour).padStart(2, "0")}:00 - ` +
      `${String((session.slotStartHour + mode.durationHours) % 24).padStart(2, "0")}:00`;

  const inserted = await tx.insert(proposals).values({
    startsAtUtc: zonedTimeToUtc(
      session.localDate,
      session.slotStartHour,
      timezone,
    ),
    localDate: session.localDate,
    slotStartHour: session.slotStartHour,
    localTimeLabel: label,
    timezone,
    venueId: session.venueId ?? "hors-application",
    venueName: session.venueName ?? "Séance hors application",
    modeId: mode.id,
    division: session.division,
    minParticipants: mode.minParticipants,
    priceEur: mode.priceEur,
    priceUno: eurToUno(mode.priceEur),
    rewardPolicyVersion: REWARD_POLICY_VERSION,
    status: "session",
    participantCount: sheet.participants.length,
    paidCount: sheet.participants.length,
    paymentComplete: true,
    creatorPlayerId: actor.playerId,
    // Le créneau n'est pas réservé : la session est déjà jouée. Laisser la clé
    // nulle évite de bloquer un créneau du calendrier pour une séance passée.
    activeSlotKey: null,
  });

  const proposalId = Number(inserted[0].insertId);

  const rows = sheet.participants
    .filter((participant) => participant.playerId !== null)
    .map((participant) => ({
      proposalId,
      playerId: participant.playerId as number,
      // La place n'est due à personne : la feuille relève une séance déjà
      // jouée, dont l'encaissement — s'il a eu lieu — s'est fait ailleurs.
      hasPaid: true,
    }));

  if (rows.length > 0) await tx.insert(proposalParticipants).values(rows);

  return proposalId;
}

/**
 * Un invité de la feuille, présenté comme un joueur pour l'affichage.
 *
 * Son identifiant est négatif : aucun compte ne le porte, et les listes
 * gardent une clé unique par ligne. Rien ne mène à une fiche.
 */
function guestCard(participant: {
  id: number;
  displayName: string;
}): PublicPlayer {
  return {
    id: -participant.id,
    displayName: participant.displayName,
    nationality: "",
    profilePhotoUrl: null,
    photoOffsetY: 0,
    accountType: "player",
    division: null,
    position: DEFAULT_POSITION,
    level: 1,
    rating: 0,
    tier: "bronze",
    goals: 0,
    assists: 0,
    defenses: 0,
    saves: 0,
    motm: 0,
    matchesPlayed: 0,
    sessionsRefereed: 0,
    isSupervisor: false,
  };
}

/** Les feuilles de saisie publiées vers cette séance. */
async function publishedSheets(executor: Executor, proposalId: number) {
  const rows = await executor
    .select({ id: statSessions.id })
    .from(statSessions)
    .where(eq(statSessions.publishedProposalId, proposalId));
  const sheets: TrackerSheet[] = [];
  for (const { id } of rows) sheets.push(await getSheet(id, executor));
  return sheets;
}

/**
 * Les équipes d'une séance, invités compris (TRACK-001) : un invité de la
 * feuille de saisie apparaît dans l'équipe où il a joué.
 */
export async function teamsWithGuests(
  executor: Executor,
  proposalId: number,
): Promise<TeamView[]> {
  const squads = await readSessionTeams(executor, proposalId);
  if (squads.length === 0) return squads;
  for (const sheet of await publishedSheets(executor, proposalId)) {
    const indexOf = new Map(
      sheet.teams.map((team) => [team.id, team.teamIndex]),
    );
    for (const participant of sheet.participants) {
      if (participant.playerId !== null) continue;
      const teamIndex = indexOf.get(participant.teamId);
      // L'équipe de la séance qui porte ce rang ; la dernière publiée si la
      // séance en compte plusieurs du même rang.
      const team = squads.filter((item) => item.teamIndex === teamIndex).at(-1);
      if (team) team.players.push(guestCard(participant));
    }
  }
  return squads;
}

/**
 * La feuille de match d'une séance, invités compris (TRACK-001).
 *
 * Un invité saisi sans compte compte au score, mais la séance publiée ne le
 * connaît pas : ses statistiques sont rangées par joueur, et il n'est pas
 * joueur. La feuille de saisie, elle, le garde. On l'y relit pour l'afficher
 * à sa place dans la feuille de match — souvent en haut : rien n'interdit au
 * meilleur buteur de ne pas avoir de compte.
 *
 * Pour l'affichage seulement : la clôture (homme du match, distinctions,
 * récompenses) lit `sessionScoreboard`, qui ne connaît que les comptes.
 */
export async function scoreboardWithGuests(
  executor: Executor,
  proposalId: number,
): Promise<SessionScoreboardRow[]> {
  const rows = await sessionScoreboard(executor, proposalId);
  const sheets = await publishedSheets(executor, proposalId);
  if (sheets.length === 0) return rows;

  const guests: SessionScoreboardRow[] = [];
  for (const sheet of sheets) {
    const durationMs = trackerMatchDurationMs(sheet.session.modeId);
    const aggregate = aggregateSession(
      sheet.matches
        .filter((match) => match.status === "finished")
        .map((match) => ({
          id: match.id,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          durationMs,
        })),
      toDomainEvents(sheet.events),
    );
    const byParticipant = new Map(
      aggregate.participants.map((line) => [line.participantId, line]),
    );
    for (const participant of sheet.participants) {
      if (participant.playerId !== null) continue;
      const line = byParticipant.get(participant.id);
      const goals = line?.goals ?? 0;
      const assists = line?.assists ?? 0;
      const defenses = line?.defenses ?? 0;
      const saves = line?.saves ?? 0;
      guests.push({
        player: guestCard(participant),
        goals,
        assists,
        defenses,
        saves,
        defensivePoints: defensiveScore({ defenses, saves }),
        points: rankingScore({
          id: -participant.id,
          displayName: participant.displayName,
          goals,
          assists,
          defenses,
          saves,
          motm: 0,
        }),
        movement: null,
      });
    }
  }

  // Ceux qui ont joué sans rien faire de notable figurent aussi : à zéro
  // partout, mais sur la feuille. Sans cela, la feuille de match ne montrait
  // que ceux qui avaient marqué, passé, défendu ou arrêté.
  const listed = new Set(rows.map((row) => row.player.id));
  const silent = [
    ...new Set(
      sheets.flatMap((sheet) =>
        sheet.participants
          .map((participant) => participant.playerId)
          .filter((id): id is number => id !== null && !listed.has(id)),
      ),
    ),
  ];
  const quiet: SessionScoreboardRow[] = [];
  if (silent.length > 0) {
    const cards = await executor
      .select(publicPlayerColumns)
      .from(players)
      .where(inArray(players.id, silent));
    for (const card of cards) {
      quiet.push({
        player: toPublicPlayer(card),
        goals: 0,
        assists: 0,
        defenses: 0,
        saves: 0,
        defensivePoints: 0,
        points: 0,
        movement: null,
      });
    }
  }

  return [...rows, ...guests, ...quiet].sort(
    (a, b) =>
      b.points - a.points ||
      b.goals - a.goals ||
      a.player.displayName.localeCompare(b.player.displayName, "fr"),
  );
}

/**
 * Le podium d'une séance, invités compris (TRACK-001) : le meilleur buteur
 * d'un amical peut être un invité sans compte.
 *
 * Sans invité, c'est exactement le podium de la séance. Avec, il se refait sur
 * la feuille complète ; l'homme du match reste celui figé à la clôture dans
 * un mode où il compte, et devient le premier de la feuille ailleurs.
 */
export async function podiumWithGuests(executor: Executor, proposalId: number) {
  const scoreboard = await scoreboardWithGuests(executor, proposalId);
  if (!scoreboard.some((row) => row.player.id < 0)) {
    return sessionPodium(executor, proposalId);
  }
  const [proposal] = await executor
    .select({ motmPlayerId: proposals.motmPlayerId, modeId: proposals.modeId })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  const counts = getGameMode(proposal?.modeId ?? "")?.effects.careerStats;
  const motm = counts
    ? (proposal?.motmPlayerId ?? null)
    : (scoreboard[0]?.player.id ?? null);
  return buildPodium(scoreboard, motm);
}

/**
 * Recalcule les moments-clés des vidéos d'une séance depuis sa feuille de
 * saisie publiée (TRACK-001).
 *
 * Les moments sont figés à la publication. Un geste explicite de
 * l'administration les refait : après un rattachement d'invité (le nom a
 * changé), ou quand la feuille en produit de nouveaux (passes décisives,
 * défenses). Il remplace les moments retouchés à la main de ces vidéos.
 *
 * Le calage d'un second angle n'est pas conservé à la publication : il se
 * relit sur ses moments déjà publiés, dont le coup d'envoi porte le décalage.
 */
export async function refreshSheetMoments(proposalId: number): Promise<number> {
  const sheets = await publishedSheets(db, proposalId);
  if (sheets.length === 0) {
    throw new AppError(
      "NOT_FOUND",
      "Aucune feuille de saisie publiée pour cette séance.",
    );
  }
  const stored = await db
    .select({
      id: sessionVideos.id,
      url: sessionVideos.url,
      moments: sessionVideos.moments,
    })
    .from(sessionVideos)
    .where(eq(sessionVideos.proposalId, proposalId));

  let updated = 0;
  for (const sheet of sheets) {
    const anchor = sheet.matches.find(
      (match) => match.videoId !== null && match.videoStartMs !== null,
    );
    for (const recording of sheet.session.videos) {
      if (recording.url === null) continue;
      const target = stored.find((row) => row.url === recording.url);
      if (!target) continue;

      let angles: TrackerAngles | null = null;
      if (anchor && anchor.videoId !== recording.id) {
        const previous = Array.isArray(target.moments)
          ? (target.moments as VideoMoment[])
          : [];
        const kickoff = previous
          .filter((moment) => moment.kind === "kickoff")
          .sort((a, b) => a.t - b.t)[0];
        angles = {
          referenceId: anchor.videoId!,
          otherId: recording.id,
          offsetMs: kickoff
            ? Math.round(kickoff.t * 1000 - anchor.videoStartMs!)
            : 0,
        };
      }
      const moments = trackerMoments(sheet, recording.id, angles);
      await db
        .update(sessionVideos)
        .set({ moments })
        .where(eq(sessionVideos.id, target.id));
      updated++;
    }
  }
  return updated;
}
