import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  getGameMode,
  type PlayerStatistics,
  type StatSessionPoint,
} from "@uno/shared";
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
 * **Toutes les séances, et un filtre par mode.** Les compteurs de carrière
 * n'avancent que dans les modes dont les effets le prévoient (MODE-002) ; un
 * amical n'y compte pas, mais un joueur veut retrouver ses buts d'amical. La
 * vue « Tout » additionne donc les compteurs de carrière et les séances des
 * autres modes ; la vue d'un mode ne lit que ses séances.
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
    .orderBy(asc(proposals.startsAtUtc));

  return rows.map((row) => ({
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
  scope: string = "all",
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

  const career = row ?? {
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

  const all = await sessionSeries(executor, playerId);
  const motmRows = await executor
    .select({ modeId: proposals.modeId, total: sql<number>`COUNT(*)` })
    .from(proposals)
    .where(
      and(
        eq(proposals.motmPlayerId, playerId),
        eq(proposals.status, "completed"),
      ),
    )
    .groupBy(proposals.modeId);
  const motmOf = new Map(motmRows.map((r) => [r.modeId, Number(r.total)]));

  // Les modes joués, du plus joué au moins joué : les filtres de l'écran.
  const counts = new Map<string, number>();
  for (const session of all) {
    counts.set(session.modeId, (counts.get(session.modeId) ?? 0) + 1);
  }
  const modes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, sessions]) => ({ id, sessions }));

  const sum = (list: StatSessionPoint[]) =>
    list.reduce(
      (acc, s) => ({
        goals: acc.goals + s.goals,
        assists: acc.assists + s.assists,
        defenses: acc.defenses + s.defenses,
        saves: acc.saves + s.saves,
      }),
      { goals: 0, assists: 0, defenses: 0, saves: 0 },
    );

  let shown: StatSessionPoint[];
  let totals: {
    goals: number;
    assists: number;
    defenses: number;
    saves: number;
    motm: number;
    matchesPlayed: number;
  };
  if (scope === "all") {
    // Les compteurs de carrière (historique repris à la main compris), plus
    // les séances des modes qui n'y comptent pas : les amicaux.
    const outside = all.filter(
      (s) => getGameMode(s.modeId)?.effects.careerStats !== true,
    );
    const extra = sum(outside);
    const extraMotm = [...motmOf.entries()]
      .filter(([modeId]) => getGameMode(modeId)?.effects.careerStats !== true)
      .reduce((acc, [, n]) => acc + n, 0);
    shown = all;
    totals = {
      goals: career.goals + extra.goals,
      assists: career.assists + extra.assists,
      defenses: career.defenses + extra.defenses,
      saves: career.saves + extra.saves,
      motm: career.motm + extraMotm,
      matchesPlayed: career.matchesPlayed,
    };
  } else {
    shown = all.filter((s) => s.modeId === scope);
    totals = {
      ...sum(shown),
      motm: motmOf.get(scope) ?? 0,
      matchesPlayed: shown.length,
    };
  }

  /**
   * Le dénominateur des ratios est le nombre de séances de la vue, pas la
   * longueur de la courbe.
   *
   * La courbe est bornée aux dernières séances pour rester lisible ; diviser
   * par sa longueur donnerait un « buts par match » qui change selon la
   * fenêtre d'affichage — un chiffre qui bouge sans que rien ne se soit passé.
   */
  const played = totals.matchesPlayed;

  return {
    scope,
    modes,
    totals: {
      ...totals,
      matchesPlayed: played,
      rating: career.rating,
      xp: career.xp,
      level: career.level,
    },
    perSession: {
      goals: perSession(totals.goals, played),
      assists: perSession(totals.assists, played),
      defenses: perSession(totals.defenses, played),
      saves: perSession(totals.saves, played),
      contributions: perSession(totals.goals + totals.assists, played),
    },
    // Les dernières séances de la vue, de la plus ancienne à la plus récente.
    sessions: shown.slice(-limit),
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
