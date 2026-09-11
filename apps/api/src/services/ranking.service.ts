import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  RANKING_FORMULA_VERSION,
  RANKING_WEIGHTS,
  type Division,
  type LeaderboardEntry,
  type RankingSort,
  type RankingStat,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { enforceDivisionEligibility } from "./eligibility.service.js";
import { players } from "../db/schema.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";

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

/**
 * Un arbitre n'entre dans aucun classement (ROLE-003).
 *
 * Il n'a ni but, ni passe, ni division : le laisser dans la table de sa
 * division l'y placerait dernier, à zéro point, et — plus grave — la
 * relégation de fin de saison, qui prend les derniers, le ferait descendre
 * d'une division qu'il n'a jamais eue. La condition est nommée ici parce
 * qu'elle vaut pour **toutes** les requêtes de ce fichier ; l'oublier dans
 * une seule suffirait à faire réapparaître le défaut.
 */
const isRankedPlayer = eq(players.accountType, "player");

const STAT_COLUMNS = {
  goals: players.goals,
  assists: players.assists,
  defenses: players.defenses,
  saves: players.saves,
  motm: players.motm,
} as const satisfies Record<RankingStat, unknown>;

/**
 * Expression SQL des points de classement, dérivée des poids partagés.
 * Le calcul est fait par la base et non en mémoire : sans cela, un LIMIT
 * appliqué avant le tri renverrait un classement faux.
 */
const rankingScoreSql = sql`ROUND(
  ${RANKING_WEIGHTS.goals} * ${players.goals}
  + ${RANKING_WEIGHTS.assists} * ${players.assists}
  + ${RANKING_WEIGHTS.defenses} * ${players.defenses}
  + ${RANKING_WEIGHTS.saves} * ${players.saves}
  + ${RANKING_WEIGHTS.motm} * ${players.motm}
, 1)`;

export async function leaderboard(
  executor: Executor,
  params: { division: Division; sort: RankingSort; limit: number },
): Promise<LeaderboardEntry[]> {
  // Le classement général trie sur les points ; les autres critères trient sur
  // une statistique brute, les points servant alors de départage.
  const sortExpression =
    params.sort === "points" ? rankingScoreSql : STAT_COLUMNS[params.sort];

  const rows = await executor
    .select({
      ...publicPlayerColumns,
      value: sortExpression,
      score: rankingScoreSql.as("ranking_score"),
    })
    .from(players)
    .where(and(eq(players.division, params.division), isRankedPlayer))
    .orderBy(
      desc(sortExpression),
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

    const { value: _value, score: _score, ...player } = row;

    return {
      position,
      value,
      sort: params.sort,
      points: score,
      player: toPublicPlayer(player),
    };
  });
}

/**
 * Position d'un joueur dans le classement de sa division (mise en avant UI).
 *
 * `null` sans division : un arbitre n'est classé nulle part (ROLE-003), et
 * l'écran d'accueil n'affiche alors pas de rang plutôt qu'un rang inventé.
 */
export async function playerPosition(
  executor: Executor,
  params: { playerId: number; division: Division | null; sort: RankingSort },
): Promise<number | null> {
  if (params.division === null) return null;

  const statColumn =
    params.sort === "points" ? rankingScoreSql : STAT_COLUMNS[params.sort];

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
        isRankedPlayer,
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
  sort: RankingSort;
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
        sort: params.sort,
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
        .where(and(eq(players.division, step.from), isRankedPlayer))
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

    // Une montée de fin de saison change autant la division qu'une montée de
    // session : les sessions à venir de l'ancienne division sont rendues
    // (CAL-002), dans la transaction qui déplace les joueurs.
    await enforceDivisionEligibility(tx, [...promoted, ...relegated]);
  });

  return { promoted, relegated };
}

export { RANKING_FORMULA_VERSION };
