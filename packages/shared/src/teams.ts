import { SESSION_MOVEMENT_COUNT, TEAM_SIZE } from "./constants.js";

/**
 * Répartition des participants en équipes équilibrées (MATCH-001).
 *
 * Méthode du tirage par chapeaux, comme un tirage au sort officiel :
 *
 *   1. les participants sont triés par niveau décroissant ;
 *   2. ils sont découpés en chapeaux de `teamCount` joueurs — le chapeau 1
 *      contient les meilleurs, le chapeau 2 les suivants, etc. ;
 *   3. chaque chapeau est mélangé indépendamment ;
 *   4. chaque équipe reçoit exactement un joueur par chapeau, en serpentin.
 *
 * L'étape 4 garantit l'équilibre (chaque équipe a un joueur de chaque niveau
 * de force), l'étape 3 garantit que la composition est réellement aléatoire.
 * Le générateur est ensemencé par l'identifiant de session : le tirage est
 * donc reproductible et auditable a posteriori.
 *
 * Pour 15 participants et 3 équipes : 3 équipes de 5, aucun joueur oublié,
 * aucun joueur en double.
 */

export interface DraftablePlayer {
  id: number;
  /** Indice de niveau, typiquement le score de classement. */
  rating: number;
}

/** PRNG mulberry32 : rapide, déterministe, suffisant pour un tirage sportif. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = items[i] as T;
    const b = items[j] as T;
    items[i] = b;
    items[j] = a;
  }
}

export interface DraftResult<T extends DraftablePlayer> {
  teams: T[][];
  /** Participants non affectés faute de place dans les équipes complètes. */
  unassigned: T[];
}

export function draftTeams<T extends DraftablePlayer>(
  players: readonly T[],
  teamCount: number,
  seed: number,
  teamSize: number = TEAM_SIZE,
): DraftResult<T> {
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error(`Nombre d'équipes invalide : ${teamCount}`);
  }
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    throw new Error(`Taille d'équipe invalide : ${teamSize}`);
  }

  // Déduplication défensive : un joueur ne peut apparaître qu'une fois.
  const uniqueById = new Map<number, T>();
  for (const player of players) uniqueById.set(player.id, player);

  const rng = createRng(seed);

  // Tri par niveau décroissant. Les joueurs de même niveau sont départagés
  // par l'identifiant, afin que le découpage en chapeaux ne dépende pas de
  // l'ordre d'arrivée des inscriptions.
  const ordered = [...uniqueById.values()].sort(
    (a, b) => b.rating - a.rating || a.id - b.id,
  );

  const capacity = teamCount * teamSize;
  const drafted = ordered.slice(0, capacity);
  const unassigned = ordered.slice(capacity);

  const teams: T[][] = Array.from({ length: teamCount }, () => []);

  for (let potIndex = 0; potIndex * teamCount < drafted.length; potIndex++) {
    const pot = drafted.slice(potIndex * teamCount, (potIndex + 1) * teamCount);
    shuffleInPlace(pot, rng);
    pot.forEach((player, positionInPot) => {
      // Serpentin : l'ordre d'attribution s'inverse d'un chapeau à l'autre,
      // ce qui compense l'écart de niveau résiduel entre chapeaux.
      const teamIndex =
        potIndex % 2 === 0 ? positionInPot : teamCount - 1 - positionInPot;
      (teams[teamIndex] as T[]).push(player);
    });
  }

  return { teams, unassigned };
}

/** Somme des niveaux d'une équipe, utile pour vérifier l'équilibrage. */
export function teamRating<T extends DraftablePlayer>(
  team: readonly T[],
): number {
  return team.reduce((total, player) => total + player.rating, 0);
}

// ---------------------------------------------------------------------------
// Enchaînement des matchs et mouvements de division
// ---------------------------------------------------------------------------

/**
 * Prochaine affiche, d'après la règle du terrain.
 *
 *   « Le vainqueur reste. En cas de match nul, l'équipe entrante reste. »
 *
 * L'équipe *entrante* d'un match est celle qui n'était pas sur le terrain au
 * match précédent — la seconde du couple, par construction, puisque c'est
 * ainsi que les matchs sont enchaînés. Pour le tout premier match il n'y a pas
 * d'entrante : les deux premières équipes s'affrontent.
 *
 * Renvoie une **suggestion**, pas une contrainte : l'administration peut
 * toujours désigner un autre couple, parce que la vraie séance a pu s'écarter
 * de la règle.
 */
export function nextPairing(
  teamIds: number[],
  previous: {
    teamAId: number;
    teamBId: number;
    scoreA: number;
    scoreB: number;
  } | null,
): { teamAId: number; teamBId: number } | null {
  if (teamIds.length < 2) return null;
  if (!previous) return { teamAId: teamIds[0]!, teamBId: teamIds[1]! };

  // Le vainqueur reste ; à égalité c'est l'entrante — la seconde du couple.
  const staying =
    previous.scoreA > previous.scoreB
      ? previous.teamAId
      : previous.scoreB > previous.scoreA
        ? previous.teamBId
        : previous.teamBId;

  // Entre en jeu l'équipe qui a attendu le plus longtemps : celle qui n'a
  // disputé aucun des deux camps du match précédent.
  const rested = teamIds.find(
    (id) => id !== previous.teamAId && id !== previous.teamBId,
  );

  // À deux équipes seulement, elles se réaffrontent.
  const incoming =
    rested ?? teamIds.find((id) => id !== staying) ?? teamIds[0]!;

  return { teamAId: staying, teamBId: incoming };
}

/**
 * Nombre de joueurs qui montent — et autant qui descendent — à l'issue d'une
 * session classée.
 *
 * Le barème vise une session complète : trois équipes de cinq, cinq montées,
 * cinq descentes, cinq maintiens. Pour une session incomplète, le tiers est
 * conservé plutôt que le chiffre absolu : appliquer « cinq et cinq » à huit
 * joueurs ferait monter ou descendre tout le monde, ce qui ne veut plus rien
 * dire.
 */
export function movementCountFor(participants: number): number {
  return Math.max(
    0,
    Math.min(SESSION_MOVEMENT_COUNT, Math.floor(participants / 3)),
  );
}

// ---------------------------------------------------------------------------
// Tirage de complément
// ---------------------------------------------------------------------------

/**
 * Complète des équipes déjà commencées avec ceux qui n'ont rien choisi
 * (MODE-005).
 *
 * **Le problème que `draftTeams` ne sait pas résoudre.** Le tirage par
 * chapeaux part de rien : il découpe l'ensemble des joueurs en chapeaux et
 * les distribue en serpentin. Il suppose donc que toutes les équipes sont
 * vides et de même taille. Dès que trois amis ont rejoint la même équipe, ce
 * n'est plus vrai — l'équilibre à atteindre n'est plus « une part de chaque
 * chapeau », mais « rattraper l'écart déjà creusé ».
 *
 * **La méthode, un joueur à la fois.** On regarde les équipes où il reste de
 * la place et on sert la plus faible. Le joueur qu'elle reçoit est tiré parmi
 * les plus forts restants — autant de candidats qu'il y a d'équipes à servir,
 * comme un chapeau de tirage au sort. Puis on recommence, forces mises à
 * jour.
 *
 * **Servir la plus faible à chaque pas est ce qui rattrape un déséquilibre.**
 * Distribuer un joueur à chaque équipe par tour — ce que fait le tirage par
 * chapeaux — n'y parvient pas : l'équipe que trois amis ont déjà remplie
 * reçoit alors un renfort de la même force que les autres, et garde son
 * avance jusqu'au bout. Ici elle attend que les autres l'aient rattrapée.
 *
 * **Le chapeau n'est pas un ornement.** Sans lui, les mêmes quinze joueurs
 * formeraient éternellement les mêmes équipes, et chacun saurait d'avance ce
 * que le tirage lui réserve. Comme ses candidats se suivent au classement,
 * il ne coûte presque rien à l'équilibre.
 *
 * Le générateur est ensemencé par l'identifiant de session : deux exécutions
 * donnent le même résultat, et un tirage se rejoue pour être vérifié.
 */
export function completeTeams<T extends DraftablePlayer>(
  squads: readonly (readonly T[])[],
  undecided: readonly T[],
  teamSize: number,
  seed: number,
): DraftResult<T> {
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    throw new Error(`Taille d'équipe invalide : ${teamSize}`);
  }

  const teams: T[][] = squads.map((squad) => [...squad]);
  if (teams.length === 0) return { teams, unassigned: [...undecided] };

  // Déduplication défensive, et personne deux fois : un joueur déjà placé
  // dans une équipe n'est pas un indécis, même si l'appelant l'a listé deux
  // fois.
  const placed = new Set(teams.flatMap((squad) => squad.map((p) => p.id)));
  const restants = new Map<number, T>();
  for (const player of undecided) {
    if (!placed.has(player.id)) restants.set(player.id, player);
  }

  // Les plus forts en tête : le chapeau se sert toujours par le haut, et
  // ceux qui restent à la fin sont les derniers servis.
  const attente = [...restants.values()].sort(
    (a, b) => b.rating - a.rating || a.id - b.id,
  );

  const rng = createRng(seed);
  const force = teams.map((squad) => teamRating(squad));

  while (attente.length > 0) {
    const ouvertes = teams
      .map((squad, index) => ({ index, size: squad.length }))
      .filter((row) => row.size < teamSize);

    if (ouvertes.length === 0) break;

    /*
     * Un tour ne sert que les équipes les moins remplies.
     *
     * **C'est ce qui rattrape un déséquilibre.** Servir tout le monde à
     * chaque tour — ce que fait le tirage par chapeaux — donne à l'équipe
     * que trois amis ont déjà remplie un renfort de la même force qu'aux
     * autres : elle garde son avance jusqu'au bout. En la faisant patienter
     * pendant que les autres la rejoignent en nombre, les renforts vont là
     * où ils manquent.
     */
    const minimum = Math.min(...ouvertes.map((row) => row.size));
    const tour = ouvertes.filter((row) => row.size === minimum);

    /*
     * Dans le tour, la plus faible choisit la première.
     *
     * Le mélange d'abord, le tri ensuite : le tri est stable, si bien que
     * deux équipes de force égale gardent l'ordre tiré. Au premier tour
     * d'une séance où personne n'a choisi, toutes les forces valent zéro —
     * l'ordre est alors entièrement tiré au sort, comme un tirage par
     * chapeaux. Dès qu'un écart existe, il commande.
     */
    shuffleInPlace(tour, rng);
    tour.sort(
      (a, b) => (force[a.index] as number) - (force[b.index] as number),
    );

    // Le chapeau : autant des plus forts restants qu'il y a d'équipes à
    // servir. Ils se suivent au classement, donc l'ordre dans lequel ils
    // tombent ne creuse rien.
    const chapeau = attente.splice(0, tour.length);

    chapeau.forEach((joueur, rang) => {
      const cible = tour[rang] as { index: number };
      (teams[cible.index] as T[]).push(joueur);
      force[cible.index] = (force[cible.index] as number) + joueur.rating;
    });
  }

  return { teams, unassigned: attente };
}
