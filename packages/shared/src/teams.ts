import { TEAM_SIZE } from "./constants.js";

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
