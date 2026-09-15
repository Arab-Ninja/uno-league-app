/**
 * Tournois entre SQUADs (TOUR-001).
 *
 * Un tournoi est une compétition à élimination directe : des clubs s'y
 * inscrivent, s'affrontent par paires, et celui qui ne perd jamais l'emporte.
 * Les règles de forme du tableau vivent ici, pures et testables, plutôt que
 * dans le service — l'écran doit annoncer le même tableau que le serveur
 * applique, et deux implémentations auraient fini par se contredire.
 */

/**
 * Tailles admises, en nombre de clubs.
 *
 * Une puissance de deux, et rien d'autre : c'est la seule forme où chaque tour
 * divise exactement le plateau. Un tableau à six aurait demandé des exempts,
 * donc un critère pour désigner qui commence au tour suivant sans jouer — une
 * faveur qu'aucun règlement de tournoi amateur ne justifie.
 */
export const TOURNAMENT_SIZES = [4, 8, 16, 32] as const;
export type TournamentSize = (typeof TOURNAMENT_SIZES)[number];

/**
 * Les tours, nommés par le nombre de clubs qui y entrent.
 *
 * L'usage français nomme les tours par la fraction de finale qu'ils
 * représentent : les « seizièmes » opposent trente-deux clubs, les
 * « huitièmes » seize. Les clés, elles, disent le nombre d'équipes — c'est ce
 * dont le code a besoin pour construire le tableau, et cela évite de se
 * demander à chaque lecture si `round16` parle de seize clubs ou de seizièmes.
 */
export const TOURNAMENT_ROUNDS = [
  "of32",
  "of16",
  "quarter",
  "semi",
  "final",
] as const;
export type TournamentRound = (typeof TOURNAMENT_ROUNDS)[number];

export const TOURNAMENT_ROUND_LABELS: Record<TournamentRound, string> = {
  of32: "16es de finale",
  of16: "8es de finale",
  quarter: "Quarts de finale",
  semi: "Demi-finales",
  final: "Finale",
};

/** Nombre de clubs qui entrent dans un tour. */
export const TOURNAMENT_ROUND_TEAMS: Record<TournamentRound, number> = {
  of32: 32,
  of16: 16,
  quarter: 8,
  semi: 4,
  final: 2,
};

export const TOURNAMENT_STATUSES = [
  "open",
  "drawn",
  "completed",
  "cancelled",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  open: "Inscriptions ouvertes",
  drawn: "Tableau tiré",
  completed: "Terminé",
  cancelled: "Annulé",
};

export function isTournamentSize(value: number): value is TournamentSize {
  return (TOURNAMENT_SIZES as readonly number[]).includes(value);
}

/**
 * Les tours d'un tournoi, du premier à la finale.
 *
 * Un tournoi à huit clubs commence en quarts : lui faire commencer en
 * huitièmes aurait affiché quatre affiches fantômes.
 */
export function roundsOf(size: TournamentSize): TournamentRound[] {
  return TOURNAMENT_ROUNDS.filter(
    (round) => TOURNAMENT_ROUND_TEAMS[round] <= size,
  );
}

/** Le tour qui suit, ou `null` quand on vient de jouer la finale. */
export function nextRound(round: TournamentRound): TournamentRound | null {
  const index = TOURNAMENT_ROUNDS.indexOf(round);
  return TOURNAMENT_ROUNDS[index + 1] ?? null;
}

/** Nombre d'affiches d'un tour. */
export function matchesInRound(round: TournamentRound): number {
  return TOURNAMENT_ROUND_TEAMS[round] / 2;
}

/**
 * Tableau initial : qui rencontre qui au premier tour.
 *
 * Les têtes de série sont classées de la plus forte à la plus faible, puis
 * appariées par les deux bouts — la première contre la dernière, la deuxième
 * contre l'avant-dernière. C'est l'appariement des tournois à têtes de série,
 * et il a une raison : sans lui, les deux meilleurs clubs peuvent se croiser
 * au premier tour et la finale se jouer entre les deux plus faibles restants.
 *
 * `seeds` contient les identifiants d'inscription **déjà triés** par force
 * décroissante. La fonction ne trie pas : elle ne connaît ni les cotes ni les
 * clubs, et c'est ce qui la rend vérifiable.
 */
export function seedPairs<T>(seeds: readonly T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let index = 0; index < seeds.length / 2; index++) {
    pairs.push([seeds[index]!, seeds[seeds.length - 1 - index]!]);
  }
  return pairs;
}

/**
 * L'affiche du tour suivant qu'alimente une affiche donnée.
 *
 * Deux affiches voisines — la 0 et la 1, la 2 et la 3 — se rejoignent dans la
 * même affiche du tour d'après. C'est ce qui donne au tableau sa forme
 * d'arbre, et au vainqueur son chemin.
 */
export function nextSlot(slot: number): number {
  return Math.floor(slot / 2);
}

/** Le vainqueur d'une affiche occupe-t-il le haut ou le bas de la suivante ? */
export function nextSide(slot: number): "home" | "away" {
  return slot % 2 === 0 ? "home" : "away";
}

/**
 * Un tournoi à élimination directe ne connaît pas le match nul.
 *
 * Il faut un qualifié : au football, on tire les penalties. Le score peut donc
 * être égal dans le temps réglementaire, mais le vainqueur doit être désigné —
 * c'est pourquoi le serveur le demande explicitement plutôt que de le déduire
 * des buts.
 */
export function needsShootout(scoreHome: number, scoreAway: number): boolean {
  return scoreHome === scoreAway;
}
