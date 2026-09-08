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
 * Ordre de tri — version 2, documentée et versionnée :
 *
 *   1. statistique sélectionnée, décroissante ;
 *   2. points de classement général, décroissants ;
 *   3. nom d'affichage, alphabétique croissant (locale fr) ;
 *   4. identifiant joueur croissant.
 *
 * Les étapes 3 et 4 garantissent un ordre total : deux joueurs strictement
 * ex aequo conservent la même position d'un rafraîchissement à l'autre — ce
 * qui compte doublement depuis que les montées et descentes se décident sur
 * ce classement.
 */
export const RANKING_FORMULA_VERSION = 2;

/**
 * Barème officiel du classement général.
 *
 * Un but vaut 1,5 point, une passe 1, une défense et un arrêt 0,5. Ces poids
 * traduisent la difficulté relative de chaque action : marquer est plus rare
 * que défendre, et l'écart doit se retrouver au classement.
 *
 * Le titre d'homme du match ne rapporte aucun point, et pour cause : il est
 * lui-même décerné au joueur qui totalise le plus de points sur la session.
 * L'inclure au barème reviendrait à récompenser deux fois la même
 * performance. Il reste affiché sur la carte et disponible comme critère de
 * tri.
 */
export const RANKING_WEIGHTS: Record<RankingStat, number> = {
  goals: 1.5,
  assists: 1,
  defenses: 0.5,
  saves: 0.5,
  motm: 0,
};

/** Le score étant fractionnaire, il est stocké et comparé au dixième près. */
export const RANKING_POINTS_DECIMALS = 1;

export interface RankablePlayer {
  id: number;
  displayName: string;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  motm: number;
}

/**
 * Points de classement général d'un joueur.
 * Arrondi au dixième pour éviter qu'une addition de nombres à virgule
 * flottante produise deux valeurs différentes pour un même total.
 */
export function rankingScore(player: RankablePlayer): number {
  const total = RANKING_STATS.reduce(
    (sum, stat) => sum + RANKING_WEIGHTS[stat] * (player[stat] ?? 0),
    0,
  );
  return Math.round(total * 10) / 10;
}

/** Alias explicite, utilisé partout où le score est présenté au joueur. */
export const leaguePoints = rankingScore;

/**
 * Score défensif, qui décerne la distinction de meilleur défenseur (§8.2).
 *
 * Défenses et arrêts comptent à parts égales : un gardien défend son but avec
 * ses mains, un défenseur avec ses pieds, et les deux protègent la même cage.
 * Ne compter que les défenses excluait mécaniquement les gardiens de la
 * distinction — c'était le défaut signalé.
 */
export function defensiveScore(
  player: Pick<RankablePlayer, "defenses" | "saves">,
): number {
  return (player.defenses ?? 0) + (player.saves ?? 0);
}

/** Formate un total de points : "42,5" plutôt que "42.5". */
export function formatPoints(points: number, locale = "fr-BE"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: RANKING_POINTS_DECIMALS,
  }).format(points);
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
