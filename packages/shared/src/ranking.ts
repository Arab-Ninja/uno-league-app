import {
  RANKING_STATS,
  RATING_MAX,
  RATING_MIN,
  RATING_SCALE,
  type RankingStat,
} from "./constants.js";

/**
 * Classement et départage des égalités (RANK-002, RANK-003).
 *
 * Formule de départage — version 1, documentée et versionnée :
 *
 *   1. statistique sélectionnée, décroissante ;
 *   2. score de classement interne, décroissant ;
 *   3. nom d'affichage, alphabétique croissant (locale fr) ;
 *   4. identifiant joueur croissant.
 *
 * Les étapes 3 et 4 garantissent un ordre total : deux joueurs strictement
 * ex aequo conservent la même position d'un rafraîchissement à l'autre.
 *
 * Score de classement = 4·buts + 3·passes + 2·défenses + 2·arrêts + 10·MOTM.
 * Les coefficients traduisent la rareté relative de chaque action ; ils sont
 * figés par version afin qu'un recalcul historique reste reproductible.
 */
export const RANKING_FORMULA_VERSION = 1;

export const RANKING_WEIGHTS: Record<RankingStat, number> = {
  goals: 4,
  assists: 3,
  defenses: 2,
  saves: 2,
  motm: 10,
};

export interface RankablePlayer {
  id: number;
  displayName: string;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  motm: number;
}

export function rankingScore(player: RankablePlayer): number {
  return RANKING_STATS.reduce(
    (total, stat) => total + RANKING_WEIGHTS[stat] * (player[stat] ?? 0),
    0,
  );
}

const nameCollator = new Intl.Collator("fr", { sensitivity: "base" });

/**
 * Comparateur total pour un classement sur `stat`.
 * À utiliser tel quel côté serveur ; l'UI ne trie jamais elle-même (P-004).
 */
export function compareForRanking(
  stat: RankingStat,
  a: RankablePlayer,
  b: RankablePlayer,
): number {
  const primary = (b[stat] ?? 0) - (a[stat] ?? 0);
  if (primary !== 0) return primary;

  const score = rankingScore(b) - rankingScore(a);
  if (score !== 0) return score;

  const byName = nameCollator.compare(a.displayName, b.displayName);
  if (byName !== 0) return byName;

  return a.id - b.id;
}

export interface RankedPlayer<T extends RankablePlayer> {
  position: number;
  player: T;
  value: number;
  score: number;
}

/**
 * Ordonne les joueurs et attribue les positions.
 * Deux joueurs strictement ex aequo (même stat ET même score) partagent la
 * même position ; la position suivante saute le nombre d'ex aequo.
 */
export function buildLeaderboard<T extends RankablePlayer>(
  players: readonly T[],
  stat: RankingStat,
): RankedPlayer<T>[] {
  const sorted = [...players].sort((a, b) => compareForRanking(stat, a, b));

  const result: RankedPlayer<T>[] = [];
  let previousValue: number | null = null;
  let previousScore: number | null = null;
  let position = 0;

  sorted.forEach((player, index) => {
    const value = player[stat] ?? 0;
    const score = rankingScore(player);
    const tied = value === previousValue && score === previousScore;
    position = tied ? position : index + 1;
    previousValue = value;
    previousScore = score;
    result.push({ position, player, value, score });
  });

  return result;
}

/**
 * Note globale de la carte joueur, bornée entre RATING_MIN et RATING_MAX.
 * Voir le commentaire de RATING_FORMULA_VERSION pour la justification du
 * barème. Calculée côté serveur et côté client à partir des mêmes chiffres :
 * les deux ne peuvent pas diverger.
 */
export function overallRating(player: RankablePlayer): number {
  const score = rankingScore(player);
  if (!Number.isFinite(score) || score <= 0) return RATING_MIN;

  const progression = 1 - Math.exp(-score / RATING_SCALE);
  return Math.min(
    RATING_MAX,
    Math.round(RATING_MIN + (RATING_MAX - RATING_MIN) * progression),
  );
}
