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
  requireSchedulableMode,
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
  type TrackerWarning,
  LIMITS,
  isDirectVideoUrl,
  parseVideoUrl,
  type TrackerVideo,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
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
  type StatSessionRow,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { applyRecordSession } from "./matches.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { requireBookableVenue } from "./venues.service.js";

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

  if (!row) throw new AppError("NOT_FOUND", "Cette feuille de saisie est introuvable.");
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

export async function listSessions(
  executor: Executor = db,
  limit = 40,
): Promise<TrackerSessionSummary[]> {
  const rows = await executor
    .select()
    .from(statSessions)
    .orderBy(desc(statSessions.localDate), desc(statSessions.id))
    .limit(limit);

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

  const sessionOfMatch = new Map(matchRows.map((row) => [row.id, row.sessionId]));
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
    matchesPerSession.set(row.sessionId, (matchesPerSession.get(row.sessionId) ?? 0) + 1);
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
    .orderBy(asc(statEvents.matchId), asc(statEvents.clockMs), asc(statEvents.id));

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

  if (!row) throw new AppError("NOT_FOUND", "Cette feuille de saisie est introuvable.");

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
  const mode = requireSchedulableMode(input.modeId);

  const venue = input.venueId
    ? await requireBookableVenue(db, input.venueId)
    : null;

  const sessionId = await db.transaction(async (tx) => {
    let localDate = input.localDate;
    let division: Division | null = input.division ?? null;
    let venueId = venue?.slug ?? null;
    let venueName = venue?.name ?? null;
    let slotStartHour = input.slotStartHour;
    let roster: number[] = [];

    if (input.proposalId != null) {
      const [proposal] = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .limit(1);

      if (!proposal) {
        throw new AppError("NOT_FOUND", "Cette session réservée est introuvable.");
      }

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
    const teamIds = await createTeams(tx, id, Math.max(2, mode.teamCount || 3));

    if (roster.length > 0) {
      await seedRoster(tx, id, teamIds, roster);
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
      input.venueId != null ? await requireBookableVenue(tx, input.venueId) : null;

    await tx
      .update(statSessions)
      .set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.localDate !== undefined ? { localDate: input.localDate } : {}),
        ...(input.slotStartHour !== undefined
          ? { slotStartHour: input.slotStartHour }
          : {}),
        ...(input.division !== undefined ? { division: input.division ?? null } : {}),
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
      after: { updated: Object.keys(input).filter((key) => key !== "sessionId") },
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
    throw new AppError("VALIDATION_ERROR", "Cette équipe n'appartient pas à la feuille.");
  }
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

  if (!row) throw new AppError("NOT_FOUND", "Ce joueur n'est pas sur la feuille.");
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

    await tx.delete(statParticipants).where(eq(statParticipants.id, participantId));
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
  actor: { userId: number },
  input: { participantId: number; playerId: number },
): Promise<TrackerSheet> {
  const sessionId = await db.transaction(async (tx) => {
    const participant = await loadParticipant(tx, input.participantId);
    const session = await lockSession(tx, participant.sessionId);
    assertEditable(session);

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

    await touch(tx, participant.sessionId);
    void actor;
    return participant.sessionId;
  });

  return getSheet(sessionId);
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
    await assertNoEvents(tx, input.sessionId, "Le tirage des équipes");

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
  what: string,
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
      `${what} n'est plus possible : des actions ont déjà été saisies.`,
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
    await assertNoEvents(tx, input.sessionId, "Reprendre une composition");

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
      throw new AppError("NOT_FOUND", "Cette feuille source n'a aucune équipe.");
    }

    const sourceParticipants = await tx
      .select()
      .from(statParticipants)
      .where(eq(statParticipants.sessionId, input.fromSessionId))
      .orderBy(asc(statParticipants.id));

    await tx
      .delete(statParticipants)
      .where(eq(statParticipants.sessionId, input.sessionId));

    const byIndex = new Map(sourceTeams.map((team) => [team.id, team.teamIndex]));
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
        ...(input.videoId !== undefined ? { videoId: input.videoId ?? null } : {}),
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
        `Une feuille ne peut pas porter plus de ${LIMITS.videosPerSession} enregistrements.`,
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
      .select({ id: statMatches.id, teamAId: statMatches.teamAId, teamBId: statMatches.teamBId })
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
      throw new AppError("RULE_VIOLATION", blockers[0]!.message);
    }

    const proposalId = await resolveTargetProposal(tx, actor, session, sheet);

    // --- Enregistrements --------------------------------------------------
    //
    // La vidéo qui a servi à compter suit la session publiée : c'est la seule
    // qui ait un sens à côté du résultat, et personne n'a à la recoller à la
    // main. Seules celles qui ont une adresse voyagent — un fichier local n'en
    // a pas, et un repère sans vidéo n'apprendrait rien à un joueur.
    const attached = await tx
      .select({ url: sessionVideos.url })
      .from(sessionVideos)
      .where(eq(sessionVideos.proposalId, proposalId));
    const already = new Set(attached.map((row) => row.url));

    for (const video of sheet.session.videos) {
      if (video.url === null) continue;
      // Republier une feuille corrigée ne doit pas empiler deux fois la même
      // vidéo sur la session.
      if (already.has(video.url)) continue;
      // La limite de la session s'applique à la copie comme à un ajout à la
      // main. Elle **n'empêche pas de publier** pour autant : la feuille
      // décide du classement, une vidéo de trop n'est pas un motif de refus.
      if (already.size >= LIMITS.videosPerSession) break;

      await tx.insert(sessionVideos).values({
        proposalId,
        url: video.url,
        label: video.label,
        provider: parseVideoUrl(video.url)?.provider ?? "other",
        addedByPlayerId: actor.playerId,
      });
      already.add(video.url);
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
    const aggregate = aggregateSession(
      sheet.matches
        .filter((match) => match.status === "finished")
        .map((match) => ({
          id: match.id,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
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

      const summary = aggregate.matches.find((item) => item.matchId === match.id);

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
    };
  });

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
      .where(and(eq(matches.proposalId, existing.id), eq(matches.status, "validated")))
      .limit(1);

    if (validated) {
      throw new AppError(
        "CONFLICT",
        "Cette session a déjà des matchs validés : sa feuille est close.",
      );
    }

    await tx.delete(matches).where(eq(matches.proposalId, existing.id));
    await tx.delete(teams).where(eq(teams.proposalId, existing.id));

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
    startsAtUtc: zonedTimeToUtc(session.localDate, session.slotStartHour, timezone),
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
