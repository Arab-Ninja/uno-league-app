import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getGameMode, type PlayerStatistics, type StatSessionPoint } from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  matchStats,
  matches,
  players,
  proposalParticipants,
  proposals,
} from "../db/schema.js";

/**
 * Statistiques détaillées d'un joueur (STAT-001).
 *
 * Le profil affiche des totaux ; ils disent ce qu'un joueur a accumulé, pas ce
 * qu'il vaut. Deux joueurs à vingt buts ne se ressemblent pas si l'un les a
 * marqués en cinq séances et l'autre en quarante. D'où deux ajouts : des
 * **ratios par séance**, et une **évolution dans le temps**.
 *
 * **Seules les séances qui comptent sont retenues.** Les compteurs de carrière
 * n'avancent que dans les modes dont les effets le prévoient (MODE-002) : y
 * mêler un amical ferait une courbe dont la somme ne retomberait pas sur le
 * total affiché ailleurs, et rien n'est plus propre à faire douter de deux
 * chiffres que de les voir se contredire.
 */

/**
 * Les séances comptabilisées d'un joueur, de la plus ancienne à la plus
 * récente.
 *
 * L'ordre chronologique n'est pas un détail : une courbe se lit de gauche à
 * droite, et la trier à l'affichage laisserait deux endroits décider du même
 * ordre.
 */
async function sessionSeries(
  executor: Executor,
  playerId: number,
  limit: number,
): Promise<StatSessionPoint[]> {
  const rows = await executor
    .select({
      proposalId: proposals.id,
      localDate: proposals.localDate,
      modeId: proposals.modeId,
      sessionPoints: proposalParticipants.sessionPoints,
      ratingAfter: proposalParticipants.ratingAfter,
      goals: sql<number>`COALESCE(SUM(${matchStats.goals}), 0)`,
      assists: sql<number>`COALESCE(SUM(${matchStats.assists}), 0)`,
      defenses: sql<number>`COALESCE(SUM(${matchStats.defenses}), 0)`,
      saves: sql<number>`COALESCE(SUM(${matchStats.saves}), 0)`,
    })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    // `left` et non `inner` : une séance jouée sans avoir marqué reste une
    // séance, et la retirer creuserait un trou dans la courbe.
    .leftJoin(matches, eq(matches.proposalId, proposals.id))
    .leftJoin(
      matchStats,
      and(
        eq(matchStats.matchId, matches.id),
        eq(matchStats.playerId, playerId),
      ),
    )
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        eq(proposals.status, "completed"),
      ),
    )
    .groupBy(
      proposals.id,
      proposals.localDate,
      proposals.modeId,
      proposalParticipants.sessionPoints,
      proposalParticipants.ratingAfter,
    )
    .orderBy(asc(proposals.startsAtUtc))
    .limit(limit);

  return rows
    .filter((row) => getGameMode(row.modeId)?.effects.careerStats === true)
    .map((row) => ({
      proposalId: row.proposalId,
      date: row.localDate,
      modeId: row.modeId,
      goals: Number(row.goals),
      assists: Number(row.assists),
      defenses: Number(row.defenses),
      saves: Number(row.saves),
      points: row.sessionPoints === null ? null : Number(row.sessionPoints),
      rating: row.ratingAfter,
    }));
}

/** Un ratio par séance, arrondi au dixième ; `0` sans séance jouée. */
function perSession(total: number, sessions: number): number {
  if (sessions <= 0) return 0;
  return Math.round((total / sessions) * 10) / 10;
}

export async function playerStatistics(
  executor: Executor,
  playerId: number,
  limit = 30,
): Promise<PlayerStatistics> {
  const [row] = await executor
    .select({
      goals: players.goals,
      assists: players.assists,
      defenses: players.defenses,
      saves: players.saves,
      motm: players.motm,
      matchesPlayed: players.matchesPlayed,
      rating: players.rating,
      xp: players.xp,
      level: players.level,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const totals = row ?? {
    goals: 0,
    assists: 0,
    defenses: 0,
    saves: 0,
    motm: 0,
    matchesPlayed: 0,
    rating: 0,
    xp: 0,
    level: 1,
  };

  const sessions = await sessionSeries(executor, playerId, limit);

  /**
   * Le dénominateur des ratios est le compteur de carrière, pas la longueur
   * de la série.
   *
   * La série est bornée aux dernières séances pour que la courbe reste
   * lisible ; diviser par sa longueur donnerait un « buts par match » qui
   * change selon la fenêtre d'affichage — un chiffre qui bouge sans que rien
   * ne se soit passé.
   */
  const played = totals.matchesPlayed;

  return {
    totals: {
      goals: totals.goals,
      assists: totals.assists,
      defenses: totals.defenses,
      saves: totals.saves,
      motm: totals.motm,
      matchesPlayed: played,
      rating: totals.rating,
      xp: totals.xp,
      level: totals.level,
    },
    perSession: {
      goals: perSession(totals.goals, played),
      assists: perSession(totals.assists, played),
      defenses: perSession(totals.defenses, played),
      saves: perSession(totals.saves, played),
      contributions: perSession(totals.goals + totals.assists, played),
    },
    sessions,
  };
}

/** Statistiques de plusieurs joueurs, pour une comparaison éventuelle. */
export async function statisticsFor(
  executor: Executor,
  playerIds: number[],
): Promise<Map<number, PlayerStatistics>> {
  const result = new Map<number, PlayerStatistics>();
  if (playerIds.length === 0) return result;

  const known = await executor
    .select({ id: players.id })
    .from(players)
    .where(inArray(players.id, playerIds));

  for (const player of known) {
    result.set(player.id, await playerStatistics(executor, player.id));
  }
  return result;
}
