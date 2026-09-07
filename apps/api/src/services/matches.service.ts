import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  AppError,
  DEFAULT_REWARD_POLICY,
  TEAM_SIZE,
  XP_AWARDS,
  draftTeams,
  getGameMode,
  levelFromXp,
  rankingScore,
  type Division,
  type MatchView,
  type PodiumAward,
  type PodiumEntry,
  type PublicPlayer,
  type ReportMatchInput,
  type TeamView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  matchStats,
  matches,
  players,
  proposalParticipants,
  proposals,
  teamMembers,
  teams,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { credit } from "./ledger.service.js";
import { lockProposal } from "./proposals.service.js";

/**
 * Équipes, matchs, statistiques et récompenses (CDC §9).
 *
 * MATCH-005 est la contrainte structurante : une validation ne doit jamais
 * compter deux fois les mêmes statistiques ni distribuer deux fois la même
 * récompense. Deux garde-fous indépendants l'assurent :
 *   1. `matches.validated_at` : une seconde validation est refusée ;
 *   2. chaque récompense porte une clé d'idempotence en base, si bien qu'un
 *      double appel concurrent est rejeté par l'index unique du registre.
 */

const TEAM_NAMES = ["Équipe A", "Équipe B", "Équipe C", "Équipe D"];

/**
 * Constitue les équipes d'une session (MATCH-001).
 * Idempotent : si les équipes existent déjà, elles sont simplement renvoyées.
 */
export async function generateTeams(
  actor: { userId: number },
  proposalId: number,
): Promise<TeamView[]> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    if (proposal.status !== "session" && proposal.status !== "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Les équipes ne peuvent être tirées qu'une fois tous les paiements reçus.",
      );
    }

    const existing = await readTeams(tx, proposalId);
    if (existing.length > 0) return existing;

    const participants = await tx
      .select({
        id: players.id,
        displayName: players.displayName,
        goals: players.goals,
        assists: players.assists,
        defenses: players.defenses,
        saves: players.saves,
        motm: players.motm,
      })
      .from(proposalParticipants)
      .innerJoin(players, eq(players.id, proposalParticipants.playerId))
      .where(eq(proposalParticipants.proposalId, proposalId))
      .orderBy(asc(proposalParticipants.joinedAt));

    const mode = getGameMode(proposal.modeId);
    const teamCount = mode?.teamCount ?? 2;

    const { teams: drawn } = draftTeams(
      participants.map((player) => ({ id: player.id, rating: rankingScore(player) })),
      teamCount,
      // La graine est l'identifiant de session : le tirage est reproductible
      // et vérifiable a posteriori.
      proposalId,
      TEAM_SIZE,
    );

    for (const [index, squad] of drawn.entries()) {
      const inserted = await tx.insert(teams).values({
        proposalId,
        name: TEAM_NAMES[index] ?? `Équipe ${index + 1}`,
        teamIndex: index,
      });
      const teamId = Number(inserted[0].insertId);

      if (squad.length > 0) {
        await tx
          .insert(teamMembers)
          .values(squad.map((player) => ({ teamId, playerId: player.id })));
      }
    }

    // Chaque équipe rencontre chaque autre équipe une fois.
    const created = await tx
      .select()
      .from(teams)
      .where(eq(teams.proposalId, proposalId))
      .orderBy(asc(teams.teamIndex));

    for (let a = 0; a < created.length; a++) {
      for (let b = a + 1; b < created.length; b++) {
        await tx.insert(matches).values({
          proposalId,
          teamAId: created[a]!.id,
          teamBId: created[b]!.id,
          status: "scheduled",
        });
      }
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.status.update",
      entityType: "proposal",
      entityId: proposalId,
      after: { teams: created.length },
    });

    return readTeams(tx, proposalId);
  });
}

async function readTeams(
  executor: Executor,
  proposalId: number,
): Promise<TeamView[]> {
  const rows = await executor
    .select()
    .from(teams)
    .where(eq(teams.proposalId, proposalId))
    .orderBy(asc(teams.teamIndex));

  if (rows.length === 0) return [];

  const members = await executor
    .select({ teamId: teamMembers.teamId, ...publicPlayerColumns })
    .from(teamMembers)
    .innerJoin(players, eq(players.id, teamMembers.playerId))
    .where(
      inArray(
        teamMembers.teamId,
        rows.map((team) => team.id),
      ),
    );

  return rows.map((team) => ({
    id: team.id,
    name: team.name,
    teamIndex: team.teamIndex,
    players: members
      .filter((member) => member.teamId === team.id)
      .map(({ teamId: _teamId, ...player }) => toPublicPlayer(player)),
  }));
}

export async function listMatches(
  executor: Executor,
  proposalId: number,
): Promise<MatchView[]> {
  const rows = await executor
    .select()
    .from(matches)
    .where(eq(matches.proposalId, proposalId))
    .orderBy(asc(matches.id));

  const squads = await readTeams(executor, proposalId);
  const byId = new Map(squads.map((team) => [team.id, team]));

  return rows.map((row) => ({
    id: row.id,
    proposalId: row.proposalId,
    status: row.status,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    playedAt: row.playedAt ? row.playedAt.toISOString() : null,
    teamA: byId.get(row.teamAId) ?? null,
    teamB: byId.get(row.teamBId) ?? null,
  }));
}

/**
 * Saisie du rapport de match (MATCH-003).
 * Le rapport est enregistré mais n'a encore aucun effet sur les statistiques
 * cumulées : il faut le valider (MATCH-005).
 */
export async function reportMatch(
  actor: { userId: number },
  input: ReportMatchInput,
): Promise<MatchView> {
  return db.transaction(async (tx) => {
    const match = await lockMatch(tx, input.matchId);

    if (match.validatedAt) {
      throw new AppError(
        "CONFLICT",
        "Ce match est déjà validé. Utilisez la correction administrative.",
      );
    }

    const roster = await tx
      .select({ playerId: teamMembers.playerId })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]));

    const allowed = new Set(roster.map((row) => row.playerId));
    for (const line of input.stats) {
      if (!allowed.has(line.playerId)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Une statistique concerne un joueur qui n'a pas disputé ce match.",
        );
      }
    }

    const motmCount = input.stats.filter((line) => line.motm).length;
    if (motmCount > 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un seul homme du match peut être désigné.",
      );
    }

    await tx.delete(matchStats).where(eq(matchStats.matchId, input.matchId));
    if (input.stats.length > 0) {
      await tx.insert(matchStats).values(
        input.stats.map((line) => ({
          matchId: input.matchId,
          playerId: line.playerId,
          goals: line.goals,
          assists: line.assists,
          defenses: line.defenses,
          saves: line.saves,
          motm: line.motm,
        })),
      );
    }

    await tx
      .update(matches)
      .set({
        scoreA: input.scoreA,
        scoreB: input.scoreB,
        status: "finished",
        playedAt: match.playedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matches.id, input.matchId));

    const [updated] = await listMatchesById(tx, input.matchId);
    void actor;
    return updated!;
  });
}

async function lockMatch(tx: Transaction, matchId: number) {
  const [row] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .for("update");

  if (!row) throw new AppError("NOT_FOUND", "Ce match est introuvable.");
  return row;
}

async function listMatchesById(
  executor: Executor,
  matchId: number,
): Promise<MatchView[]> {
  const [row] = await executor
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return [];
  return listMatches(executor, row.proposalId).then((all) =>
    all.filter((match) => match.id === matchId),
  );
}

/**
 * Validation d'un match (MATCH-004, MATCH-005).
 *
 * Reporte les statistiques sur les compteurs cumulés des joueurs, attribue
 * l'XP et la récompense « meilleure équipe » aux vainqueurs, puis marque le
 * match comme validé. Une seconde validation est refusée.
 */
export async function validateMatch(
  actor: { userId: number },
  matchId: number,
): Promise<{ playersUpdated: number; rewardedPlayers: number }> {
  return db.transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);

    if (match.validatedAt) {
      // MATCH-005 : deux validations successives ne dupliquent rien.
      throw new AppError("CONFLICT", "Ce match a déjà été validé.");
    }
    if (match.status !== "finished") {
      throw new AppError(
        "RULE_VIOLATION",
        "Le rapport de match doit être saisi avant validation.",
      );
    }

    const [proposal] = await tx
      .select({ division: proposals.division, modeId: proposals.modeId })
      .from(proposals)
      .where(eq(proposals.id, match.proposalId))
      .limit(1);

    const division: Division = proposal?.division ?? "D3";
    const ranked = getGameMode(proposal?.modeId ?? "")?.ranked ?? false;

    const lines = await tx
      .select()
      .from(matchStats)
      .where(eq(matchStats.matchId, matchId));

    let playersUpdated = 0;

    for (const line of lines) {
      const xpGain =
        XP_AWARDS.sessionPlayed +
        line.goals * XP_AWARDS.goal +
        line.assists * XP_AWARDS.assist +
        line.defenses * XP_AWARDS.defense +
        line.saves * XP_AWARDS.save +
        (line.motm ? XP_AWARDS.motm : 0);

      // Les statistiques ne comptent au classement que pour un mode classé
      // (§8 : le match amical n'a aucun impact sur le classement). L'XP, elle,
      // est acquise dans tous les modes.
      const statIncrements = ranked
        ? {
            goals: sql`${players.goals} + ${line.goals}`,
            assists: sql`${players.assists} + ${line.assists}`,
            defenses: sql`${players.defenses} + ${line.defenses}`,
            saves: sql`${players.saves} + ${line.saves}`,
            ...(line.motm ? { motm: sql`${players.motm} + 1` } : {}),
          }
        : {};

      await tx
        .update(players)
        .set({
          ...statIncrements,
          xp: sql`${players.xp} + ${xpGain}`,
          updatedAt: new Date(),
        })
        .where(eq(players.id, line.playerId));

      const [refreshed] = await tx
        .select({ xp: players.xp })
        .from(players)
        .where(eq(players.id, line.playerId))
        .limit(1);

      if (refreshed) {
        await tx
          .update(players)
          .set({ level: levelFromXp(refreshed.xp) })
          .where(eq(players.id, line.playerId));
      }
      playersUpdated++;
    }

    // Récompense « meilleure équipe » aux vainqueurs du match (§8.2).
    let rewardedPlayers = 0;
    if (match.scoreA !== match.scoreB) {
      const winningTeamId = match.scoreA > match.scoreB ? match.teamAId : match.teamBId;
      const winners = await tx
        .select({ playerId: teamMembers.playerId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, winningTeamId));

      const amount = DEFAULT_REWARD_POLICY.bestTeam[division];
      for (const winner of winners) {
        await credit(tx, {
          playerId: winner.playerId,
          amount,
          type: "reward",
          description: "Récompense meilleure équipe",
          referenceType: "match",
          referenceId: matchId,
          // Clé unique en base : un double appel ne peut pas créditer deux fois.
          idempotencyKey: `reward:match:${matchId}:bestTeam:${winner.playerId}`,
        });
        rewardedPlayers++;
      }
    }

    await tx
      .update(matches)
      .set({
        status: "validated",
        validatedAt: new Date(),
        validatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "match.validate",
      entityType: "match",
      entityId: matchId,
      after: { scoreA: match.scoreA, scoreB: match.scoreB, playersUpdated },
    });

    return { playersUpdated, rewardedPlayers };
  });
}

/**
 * Clôture d'une session : verse la récompense de participation une seule fois
 * par joueur et passe la proposition à l'état terminé (§8.2).
 */
export async function completeSession(
  actor: { userId: number },
  proposalId: number,
): Promise<{ rewarded: number }> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    if (proposal.status !== "session") {
      throw new AppError(
        "RULE_VIOLATION",
        "Seule une session confirmée peut être clôturée.",
      );
    }

    const participants = await tx
      .select({ playerId: proposalParticipants.playerId })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.hasPaid, true),
        ),
      );

    const division: Division = proposal.division ?? "D3";
    const amount = DEFAULT_REWARD_POLICY.participation[division];

    for (const participant of participants) {
      await credit(tx, {
        playerId: participant.playerId,
        amount,
        type: "reward",
        description: "Récompense de participation",
        referenceType: "proposal",
        referenceId: proposalId,
        idempotencyKey: `reward:session:${proposalId}:participation:${participant.playerId}`,
      });

      // Compteur affiché sur la carte joueur. La clôture n'étant possible
      // qu'une fois — le statut change dans la même transaction — il ne peut
      // pas être incrémenté deux fois pour la même session.
      await tx
        .update(players)
        .set({ matchesPlayed: sql`${players.matchesPlayed} + 1` })
        .where(eq(players.id, participant.playerId));
    }

    await tx
      .update(proposals)
      .set({ status: "completed", activeSlotKey: null, updatedAt: new Date() })
      .where(eq(proposals.id, proposalId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.status.update",
      entityType: "proposal",
      entityId: proposalId,
      before: { status: "session" },
      after: { status: "completed", rewarded: participants.length },
    });

    return { rewarded: participants.length };
  });
}

export { readTeams };

/**
 * Podium d'une session terminée (§8.2).
 *
 * Les distinctions sont calculées à partir des rapports de match VALIDÉS de
 * la session : un match saisi mais non validé n'y figure pas, pour la même
 * raison qu'il n'alimente pas le classement. Une distinction n'apparaît que
 * si elle a été réellement obtenue — pas de « meilleur buteur » avec zéro but.
 */
export async function sessionPodium(
  executor: Executor,
  proposalId: number,
): Promise<PodiumEntry[]> {
  // Les statistiques de la session sont préfixées : les colonnes de la carte
  // portent les mêmes noms, mais désignent les totaux de carrière.
  const rows = await executor
    .select({
      sessionGoals: matchStats.goals,
      sessionAssists: matchStats.assists,
      sessionDefenses: matchStats.defenses,
      sessionMotm: matchStats.motm,
      ...publicPlayerColumns,
    })
    .from(matchStats)
    .innerJoin(matches, eq(matches.id, matchStats.matchId))
    .innerJoin(players, eq(players.id, matchStats.playerId))
    .where(
      and(eq(matches.proposalId, proposalId), eq(matches.status, "validated")),
    );

  if (rows.length === 0) return [];

  // Un joueur peut disputer plusieurs matchs d'une même session : on cumule.
  const totals = new Map<
    number,
    { goals: number; assists: number; defenses: number; motm: number; player: PublicPlayer }
  >();

  for (const row of rows) {
    const { sessionGoals, sessionAssists, sessionDefenses, sessionMotm, ...player } = row;

    const current = totals.get(player.id) ?? {
      goals: 0,
      assists: 0,
      defenses: 0,
      motm: 0,
      player: toPublicPlayer(player),
    };
    current.goals += sessionGoals;
    current.assists += sessionAssists;
    current.defenses += sessionDefenses;
    current.motm += sessionMotm ? 1 : 0;
    totals.set(player.id, current);
  }

  const awards: { award: PodiumAward; label: string; key: "goals" | "assists" | "defenses" | "motm" }[] = [
    { award: "topScorer", label: "Meilleur buteur", key: "goals" },
    { award: "topAssist", label: "Meilleur passeur", key: "assists" },
    { award: "topDefender", label: "Meilleur défenseur", key: "defenses" },
    { award: "motm", label: "Homme du match", key: "motm" },
  ];

  const entries: PodiumEntry[] = [];

  for (const { award, label, key } of awards) {
    const ranked = [...totals.values()]
      .filter((entry) => entry[key] > 0)
      // À égalité, le joueur au meilleur score de classement est retenu, puis
      // l'identifiant le plus petit : le podium est ainsi stable d'un
      // affichage à l'autre.
      .sort(
        (a, b) =>
          b[key] - a[key] ||
          b.player.rating - a.player.rating ||
          a.player.id - b.player.id,
      );

    const best = ranked[0];
    if (best) {
      entries.push({ award, label, value: best[key], player: best.player });
    }
  }

  return entries;
}
