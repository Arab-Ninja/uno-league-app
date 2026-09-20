import { SQUAD_RATING_INITIAL, SQUAD_RATING_K } from "./constants.js";

/**
 * Cote d'un SQUAD, de type Elo (SQUAD-007).
 *
 * **Indépendante des mises**, et la spécification insiste avec raison : une
 * équipe riche qui mise gros ne devient pas meilleure pour autant. Force
 * sportive et activité économique sont deux mesures séparées ; les mélanger
 * rendrait le classement illisible, et permettrait d'acheter sa place.
 *
 * Le barème est celui d'Elo, sans variante : l'écart de cote donne le
 * résultat attendu, et l'écart entre l'attendu et le réel déplace les deux
 * cotes d'autant, en sens contraire. Battre plus fort que soi rapporte
 * beaucoup, battre plus faible rapporte peu, et perdre contre plus faible
 * coûte cher.
 */

/** Issue d'une rencontre du point de vue d'un camp. */
export type SquadMatchOutcome = "win" | "draw" | "loss";

/** Score conventionnel d'Elo : 1 pour une victoire, ½ pour un nul. */
export function outcomeScore(outcome: SquadMatchOutcome): number {
  if (outcome === "win") return 1;
  if (outcome === "draw") return 0.5;
  return 0;
}

/**
 * Résultat attendu d'un camp, entre 0 et 1.
 *
 * 400 points d'écart valent dix contre un : c'est la constante d'origine
 * d'Elo, et la garder rend les cotes comparables à l'intuition qu'en ont les
 * joueurs d'échecs — un repère vaut mieux qu'un réglage arbitraire.
 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/**
 * Déplacement de cote d'un camp, arrondi à l'entier.
 *
 * L'arrondi se fait ici et pas chez l'appelant : deux arrondis différents des
 * deux côtés feraient dériver la somme des cotes de la ligue.
 */
export function ratingDelta(
  rating: number,
  opponentRating: number,
  outcome: SquadMatchOutcome,
): number {
  const expected = expectedScore(rating, opponentRating);
  return Math.round(SQUAD_RATING_K * (outcomeScore(outcome) - expected));
}

/**
 * Les deux cotes après une rencontre.
 *
 * **Les deux se calculent sur les cotes d'avant.** Mettre à jour le premier
 * camp puis calculer le second sur sa nouvelle cote donnerait un résultat
 * dépendant de l'ordre, et ferait apparaître ou disparaître des points.
 *
 * Une cote ne descend pas sous zéro : la base l'interdit déjà
 * (`squads_rating_non_negative`), et un club qui enchaînerait les défaites
 * n'aurait de toute façon rien à gagner à une cote négative.
 */
export function nextSquadRatings(
  challengerRating: number,
  challengedRating: number,
  /** Le vainqueur, ou `null` pour un match nul. */
  winner: "challenger" | "challenged" | null,
): { challenger: number; challenged: number } {
  const challengerOutcome: SquadMatchOutcome =
    winner === null ? "draw" : winner === "challenger" ? "win" : "loss";
  const challengedOutcome: SquadMatchOutcome =
    winner === null ? "draw" : winner === "challenged" ? "win" : "loss";

  return {
    challenger: Math.max(
      0,
      challengerRating +
        ratingDelta(challengerRating, challengedRating, challengerOutcome),
    ),
    challenged: Math.max(
      0,
      challengedRating +
        ratingDelta(challengedRating, challengerRating, challengedOutcome),
    ),
  };
}

/**
 * Libellé d'un niveau de cote, pour situer un club d'un coup d'œil.
 *
 * Les seuils partent de la cote de départ : un club neuf est « Prometteur »,
 * et l'échelle s'ouvre symétriquement de part et d'autre.
 */
export type SquadTier =
  "elite" | "confirmed" | "promising" | "running_in" | "rebuilding";

/**
 * Le palier d'un club, sous forme d'identifiant.
 *
 * L'identifiant plutôt que le mot : l'interface existe en trois langues
 * (I18N-001) et le mot dépend de celle qu'on lit, alors que le seuil ne
 * dépend que de la cote. `squadTier` garde le mot français pour ce qui n'a
 * pas de dictionnaire — le serveur, les tests.
 */
export function squadTierKey(rating: number): SquadTier {
  if (rating >= SQUAD_RATING_INITIAL + 300) return "elite";
  if (rating >= SQUAD_RATING_INITIAL + 150) return "confirmed";
  if (rating >= SQUAD_RATING_INITIAL - 50) return "promising";
  if (rating >= SQUAD_RATING_INITIAL - 200) return "running_in";
  return "rebuilding";
}

const TIER_WORDS: Record<SquadTier, string> = {
  elite: "Élite",
  confirmed: "Confirmé",
  promising: "Prometteur",
  running_in: "En rodage",
  rebuilding: "En reconstruction",
};

export function squadTier(rating: number): string {
  return TIER_WORDS[squadTierKey(rating)];
}
