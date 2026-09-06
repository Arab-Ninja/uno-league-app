import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  RANKING_FORMULA_VERSION,
  RANKING_WEIGHTS,
  type Division,
  type LeaderboardEntry,
  type RankingStat,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { players } from "../db/schema.js";

/**
 * Classements (CDC §10).
 *
 * P-004 : le tri n'est jamais fait par le client. Le serveur applique
 * exactement l'ordre documenté dans `@uno/shared` :
 *   statistique choisie ↓, score de classement ↓, nom ↑, identifiant ↑.
 *
 * Le score est calculé en SQL avec les mêmes coefficients que la fonction
 * partagée, afin que la pagination reste correcte : trier en mémoire après un
 * LIMIT donnerait un classement faux.
 */

const STAT_COLUMNS = {
  goals: players.goals,
  assists: players.assists,
  defenses: players.defenses,
  saves: players.saves,
  motm: players.motm,
} as const satisfies Record<RankingStat, unknown>;

/** Expression SQL du score de classement, dérivée des poids partagés. */
const rankingScoreSql = sql`(
  ${RANKING_WEIGHTS.goals} * ${players.goals}
  + ${RANKING_WEIGHTS.assists} * ${players.assists}
  + ${RANKING_WEIGHTS.defenses} * ${players.defenses}
  + ${RANKING_WEIGHTS.saves} * ${players.saves}
  + ${RANKING_WEIGHTS.motm} * ${players.motm}
)`;

export async function leaderboard(
  executor: Executor,
  params: { division: Division; stat: RankingStat; limit: number },
): Promise<LeaderboardEntry[]> {
  const statColumn = STAT_COLUMNS[params.stat];

  const rows = await executor
    .select({
      id: players.id,
      displayName: players.displayName,
      nationality: players.nationality,
      profilePhotoUrl: players.profilePhotoUrl,
      division: players.division,
      level: players.level,
      value: statColumn,
      score: rankingScoreSql.as("ranking_score"),
    })
    .from(players)
    .where(eq(players.division, params.division))
    .orderBy(
      desc(statColumn),
      desc(rankingScoreSql),
      asc(players.displayName),
      asc(players.id),
    )
    .limit(params.limit);

  // RANK-003 : deux joueurs strictement ex aequo partagent la même position.
  let position = 0;
  let previousValue: number | null = null;
  let previousScore: number | null = null;

  return rows.map((row, index) => {
    const value = Number(row.value);
    const score = Number(row.score);
    const tied = value === previousValue && score === previousScore;
    position = tied ? position : index + 1;
    previousValue = value;
    previousScore = score;

    return {
      position,
      value,
      stat: params.stat,
      player: {
        id: row.id,
        displayName: row.displayName,
        nationality: row.nationality,
        profilePhotoUrl: row.profilePhotoUrl,
        division: row.division,
        level: row.level,
      },
    };
  });
}

/** Position d'un joueur dans le classement de sa division (mise en avant UI). */
export async function playerPosition(
  executor: Executor,
  params: { playerId: number; division: Division; stat: RankingStat },
): Promise<number | null> {
  const statColumn = STAT_COLUMNS[params.stat];

  const [self] = await executor
    .select({ value: statColumn, score: rankingScoreSql.as("ranking_score") })
    .from(players)
    .where(eq(players.id, params.playerId))
    .limit(1);

  if (!self) return null;

  const [ahead] = await executor
    .select({ total: sql<number>`COUNT(*)` })
    .from(players)
    .where(
      and(
        eq(players.division, params.division),
        sql`(
          ${statColumn} > ${Number(self.value)}
          OR (${statColumn} = ${Number(self.value)} AND ${rankingScoreSql} > ${Number(self.score)})
        )`,
      ),
    );

  return Number(ahead?.total ?? 0) + 1;
}

/**
 * Applique les promotions et relégations de fin de saison (RANK-005).
 * Le nombre de joueurs concernés vient de la configuration de la saison :
 * il n'est jamais codé en dur, ni côté serveur ni côté interface.
 */
export async function applyPromotionsAndRelegations(params: {
  promotionCount: number;
  relegationCount: number;
  stat: RankingStat;
}): Promise<{ promoted: number[]; relegated: number[] }> {
  const promoted: number[] = [];
  const relegated: number[] = [];

  const ladder: { from: Division; to: Division }[] = [
    { from: "D2", to: "D1" },
    { from: "D3", to: "D2" },
  ];

  await db.transaction(async (tx) => {
    for (const step of ladder) {
      const top = await leaderboard(tx, {
        division: step.from,
        stat: params.stat,
        limit: params.promotionCount,
      });
      for (const entry of top) {
        await tx
          .update(players)
          .set({ division: step.to, updatedAt: new Date() })
          .where(eq(players.id, entry.player.id));
        promoted.push(entry.player.id);
      }
    }

    const demotions: { from: Division; to: Division }[] = [
      { from: "D1", to: "D2" },
      { from: "D2", to: "D3" },
    ];

    for (const step of demotions) {
      const bottom = await tx
        .select({ id: players.id })
        .from(players)
        .where(eq(players.division, step.from))
        .orderBy(asc(rankingScoreSql), asc(players.displayName), asc(players.id))
        .limit(params.relegationCount);

      for (const row of bottom) {
        if (promoted.includes(row.id)) continue;
        await tx
          .update(players)
          .set({ division: step.to, updatedAt: new Date() })
          .where(eq(players.id, row.id));
        relegated.push(row.id);
      }
    }
  });

  return { promoted, relegated };
}

export { RANKING_FORMULA_VERSION };
