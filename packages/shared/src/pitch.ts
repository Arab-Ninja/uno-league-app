/**
 * Les places sur un terrain, et la formation qui les dispose (MODE-003).
 *
 * Le camp ne suffisait pas. Un joueur qui s'inscrit choisit son équipe, mais
 * pas ce qu'il vient y faire — et dix personnes qui arrivent sans savoir qui
 * garde les buts perdent un quart d'heure à se le demander. La composition
 * répond avant le coup d'envoi.
 *
 * **L'effectif se choisit, donc la formation aussi.** Une grille figée à onze
 * aurait laissé quatre trous sur un terrain à sept, ce qui se lit comme un
 * manque de joueurs plutôt que comme un format. Chaque effectif a les
 * siennes, et ce sont des formations réelles de ce sport — rien n'est inventé
 * pour combler une ligne.
 *
 * **Et plusieurs par effectif** (PITCH-001). Un 1-2-2 ne se joue pas comme un
 * 1-3-1, et imposer la même forme à tout le monde revenait à choisir la
 * tactique à la place des joueurs. La forme se change jusqu'au coup d'envoi,
 * par n'importe qui de l'équipe.
 *
 * Ces formations décrivent **où l'on se place**, pas une tactique imposée :
 * le placement n'engage rien et ne compte nulle part.
 */

/** Ce qu'une place demande, dans les grandes lignes. */
export type PitchRole = "GB" | "DEF" | "MIL" | "ATT";

export const PITCH_ROLE_LABELS: Record<PitchRole, string> = {
  GB: "Gardien",
  DEF: "Défense",
  MIL: "Milieu",
  ATT: "Attaque",
};

/** Une place nommée du terrain. */
export interface PitchSlot {
  /** Identifiant stable, stocké tel quel : `GB`, `DEF1`, `MIL3`, `ATT2`. */
  id: string;
  role: PitchRole;
  label: string;
}

/** Combien de joueurs par ligne, de la défense à l'attaque. */
interface Shape {
  DEF: number;
  MIL: number;
  ATT: number;
}

/**
 * Une formation : son identifiant, et sa forme.
 *
 * **L'identifiant est la notation**, gardien compris — « 1-2-2 », « 1-3-1 ».
 * C'est ce qu'un joueur lit sur une feuille de match, et cela ne se traduit
 * pas : la notation est la même en trois langues. Elle est aussi stable, ce
 * qu'un libellé n'est pas, et c'est elle qui part en base.
 */
export interface Formation {
  id: string;
  shape: Shape;
}

/** Écrit la notation d'une forme, gardien compris : « 1-3-2-1 ». */
function notation(shape: Shape): string {
  return [1, shape.DEF, shape.MIL, shape.ATT].filter((n) => n > 0).join("-");
}

function formation(DEF: number, MIL: number, ATT: number): Formation {
  const shape = { DEF, MIL, ATT };
  return { id: notation(shape), shape };
}

/**
 * Les formations de chaque effectif, **la première étant celle par défaut**.
 *
 * Le défaut est ce qui se jouait avant que la forme ne se choisisse : une
 * séance déjà composée garde donc exactement son terrain, et personne ne
 * retrouve son équipe redessinée un matin.
 *
 * Le futsal n'est pas un petit football à onze. À cinq — l'amical, la UNO
 * League, le club, le tournoi — les quatre joueurs de champ se rangent en
 * losange (un fixo, deux ailes, un pivot), en carré, en ligne de trois
 * derrière un pivot, ou tous les quatre de front. Ce sont les quatre systèmes
 * du jeu, et ils portent ici leur notation habituelle.
 */
const FORMATIONS: Record<number, Formation[]> = {
  5: [
    formation(1, 2, 1), // 1-1-2-1 — le losange : fixo, deux ailes, pivot
    formation(2, 0, 2), // 1-2-2 — le carré
    formation(0, 3, 1), // 1-3-1 — ligne de trois, un pivot
    formation(0, 4, 0), // 1-4 — les quatre de front, qui tournent
  ],
  7: [formation(3, 2, 1), formation(2, 3, 1), formation(3, 1, 2)],
  8: [formation(3, 3, 1), formation(3, 2, 2), formation(4, 2, 1)],
  9: [formation(4, 3, 1), formation(3, 4, 1), formation(4, 2, 2)],
  10: [formation(4, 4, 1), formation(4, 3, 2), formation(3, 4, 2)],
  11: [
    formation(4, 4, 2),
    formation(4, 3, 3),
    formation(3, 5, 2),
    formation(5, 3, 2),
  ],
};

/**
 * Le mot qui remplace le rôle générique, pour un effectif donné.
 *
 * À cinq, « milieu » serait une traduction molle de ce que le futsal appelle
 * une aile. Ailleurs, les libellés génériques conviennent — un football à
 * onze a bien des milieux.
 */
const ROLE_OVERRIDES: Record<number, Partial<Record<PitchRole, string>>> = {
  5: { MIL: "Aile", DEF: "Défense" },
};

/** Les effectifs pour lesquels une formation existe. */
export const PITCH_TEAM_SIZES = Object.keys(FORMATIONS)
  .map(Number)
  .sort((a, b) => a - b);

/** Les formations proposées pour un effectif, dans l'ordre d'affichage. */
export function formationsFor(playersPerTeam: number): Formation[] {
  return FORMATIONS[playersPerTeam] ?? [];
}

/**
 * La formation par défaut d'un effectif, ou `null` s'il n'en a aucune.
 *
 * C'est elle qui s'applique à une équipe qui n'a rien choisi — donc à toutes
 * celles qui existaient avant que le choix n'existe.
 */
export function defaultFormation(playersPerTeam: number): string | null {
  return formationsFor(playersPerTeam)[0]?.id ?? null;
}

/** Cette notation est-elle une formation de cet effectif ? */
export function isFormation(playersPerTeam: number, id: string): boolean {
  return formationsFor(playersPerTeam).some((row) => row.id === id);
}

/**
 * La forme retenue : celle demandée, ou le défaut.
 *
 * Une formation inconnue retombe sur le défaut plutôt que de rendre un
 * terrain vide. C'est le cas d'une équipe composée avant qu'une forme ne soit
 * retirée du catalogue : son terrain reste lisible, il change seulement de
 * dessin — ce qui vaut mieux qu'un écran blanc.
 */
function shapeOf(playersPerTeam: number, id?: string | null): Shape | null {
  const choix = formationsFor(playersPerTeam);
  if (choix.length === 0) return null;
  return (choix.find((row) => row.id === id) ?? choix[0]!).shape;
}

/**
 * La formation d'un effectif, **rangée par rangée, de l'attaque au but**.
 *
 * C'est l'ordre d'affichage : le terrain se regarde depuis sa propre surface,
 * l'adversaire au fond. Un effectif hors bornes rend un tableau vide plutôt
 * que d'inventer une forme — l'appelant sait alors qu'il n'y a rien à
 * afficher, au lieu de montrer une grille fausse.
 *
 * Les lignes vides ne sont pas rendues : un 1-2-2 n'a pas de milieu, et une
 * rangée sans place aurait creusé un trou au milieu du terrain.
 */
export function formationFor(
  playersPerTeam: number,
  id?: string | null,
): PitchSlot[][] {
  const shape = shapeOf(playersPerTeam, id);
  if (!shape) return [];

  const labelOf = (role: PitchRole) =>
    ROLE_OVERRIDES[playersPerTeam]?.[role] ?? PITCH_ROLE_LABELS[role];

  const line = (role: Exclude<PitchRole, "GB">, count: number): PitchSlot[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `${role}${index + 1}`,
      role,
      label: labelOf(role),
    }));

  const rangees: PitchSlot[][] = [
    line("ATT", shape.ATT),
    line("MIL", shape.MIL),
    line("DEF", shape.DEF),
    [{ id: "GB", role: "GB", label: labelOf("GB") }],
  ];
  return rangees.filter((row) => row.length > 0);
}

/** Toutes les places d'une formation, à plat. */
export function pitchSlotsFor(
  playersPerTeam: number,
  id?: string | null,
): PitchSlot[] {
  return formationFor(playersPerTeam, id).flat();
}

/**
 * Cette place existe-t-elle dans cette formation ?
 *
 * Posée ici plutôt qu'au serveur seul : l'écran s'en sert pour ne pas
 * proposer une place qui serait refusée, et le serveur pour refuser celle qui
 * serait proposée quand même. Une seule règle, deux usages.
 */
export function isPitchSlot(
  playersPerTeam: number,
  slotId: string,
  id?: string | null,
): boolean {
  return pitchSlotsFor(playersPerTeam, id).some((slot) => slot.id === slotId);
}

/** Le libellé d'une place, ou `null` si elle n'appartient pas à la formation. */
export function pitchSlotLabel(
  playersPerTeam: number,
  slotId: string,
  id?: string | null,
): string | null {
  const places = pitchSlotsFor(playersPerTeam, id);
  const slot = places.find((row) => row.id === slotId);
  if (!slot) return null;

  /*
   * Une ligne à plusieurs places se numérote, une ligne unique non : « Milieu
   * 3 » a du sens quand il y en a quatre, « Attaque 1 » n'en a aucun quand il
   * n'y a qu'une pointe.
   */
  const sameRole = places.filter((row) => row.role === slot.role);
  if (sameRole.length <= 1) return slot.label;
  return `${slot.label} ${slotId.replace(/^\D+/, "")}`;
}
