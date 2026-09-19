/**
 * Les places sur un terrain de Grand Foot (MODE-003).
 *
 * Le camp ne suffisait pas. Un joueur qui s'inscrit choisit son équipe, mais
 * pas ce qu'il vient y faire — et dix personnes qui arrivent sans savoir qui
 * garde les buts perdent un quart d'heure à se le demander. La composition
 * répond avant le coup d'envoi.
 *
 * **L'effectif se choisit de sept à onze, donc la formation aussi.** Une
 * grille figée à onze aurait laissé quatre trous sur un terrain à sept, ce
 * qui se lit comme un manque de joueurs plutôt que comme un format. Chaque
 * effectif a la sienne, et c'est une formation réelle de ce sport — rien
 * n'est inventé pour combler une ligne.
 *
 * Ces formations décrivent **où l'on se place**, pas une tactique imposée :
 * le placement n'engage rien, ne compte nulle part, et se change jusqu'au
 * coup d'envoi.
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

/**
 * Combien de joueurs par ligne, selon l'effectif — de l'attaque au but.
 *
 * Les formations retenues, en notation habituelle : 1-3-2-1 à sept, 1-3-3-1
 * à huit, 1-4-3-1 à neuf, 1-4-4-1 à dix, 4-4-2 à onze. Elles ont toutes un
 * gardien et une seule pointe, sauf à onze où le terrain plein en porte deux.
 * Le but est qu'un joueur reconnaisse la forme sans qu'on la lui explique.
 */
const SHAPES: Record<number, { ATT: number; MIL: number; DEF: number }> = {
  7: { ATT: 1, MIL: 2, DEF: 3 },
  8: { ATT: 1, MIL: 3, DEF: 3 },
  9: { ATT: 1, MIL: 3, DEF: 4 },
  10: { ATT: 1, MIL: 4, DEF: 4 },
  11: { ATT: 2, MIL: 4, DEF: 4 },
};

/** Les effectifs pour lesquels une formation existe. */
export const PITCH_TEAM_SIZES = Object.keys(SHAPES)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * La formation d'un effectif, **rangée par rangée, de l'attaque au but**.
 *
 * C'est l'ordre d'affichage : le terrain se regarde depuis sa propre surface,
 * l'adversaire au fond. Un effectif hors bornes rend un tableau vide plutôt
 * que d'inventer une forme — l'appelant sait alors qu'il n'y a rien à
 * afficher, au lieu de montrer une grille fausse.
 */
export function formationFor(playersPerTeam: number): PitchSlot[][] {
  const shape = SHAPES[playersPerTeam];
  if (!shape) return [];

  const line = (role: Exclude<PitchRole, "GB">, count: number): PitchSlot[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `${role}${index + 1}`,
      role,
      label: PITCH_ROLE_LABELS[role],
    }));

  return [
    line("ATT", shape.ATT),
    line("MIL", shape.MIL),
    line("DEF", shape.DEF),
    [{ id: "GB", role: "GB", label: PITCH_ROLE_LABELS.GB }],
  ];
}

/** Toutes les places d'une formation, à plat. */
export function pitchSlotsFor(playersPerTeam: number): PitchSlot[] {
  return formationFor(playersPerTeam).flat();
}

/**
 * Cette place existe-t-elle dans cette formation ?
 *
 * Posée ici plutôt qu'au serveur seul : l'écran s'en sert pour ne pas
 * proposer une place qui serait refusée, et le serveur pour refuser celle qui
 * serait proposée quand même. Une seule règle, deux usages.
 */
export function isPitchSlot(playersPerTeam: number, slotId: string): boolean {
  return pitchSlotsFor(playersPerTeam).some((slot) => slot.id === slotId);
}

/** Le libellé d'une place, ou `null` si elle n'appartient pas à la formation. */
export function pitchSlotLabel(
  playersPerTeam: number,
  slotId: string,
): string | null {
  const slot = pitchSlotsFor(playersPerTeam).find((row) => row.id === slotId);
  if (!slot) return null;

  /*
   * Une ligne à plusieurs places se numérote, une ligne unique non : « Milieu
   * 3 » a du sens quand il y en a quatre, « Attaque 1 » n'en a aucun quand il
   * n'y a qu'une pointe.
   */
  const sameRole = pitchSlotsFor(playersPerTeam).filter(
    (row) => row.role === slot.role,
  );
  if (sameRole.length <= 1) return slot.label;
  return `${slot.label} ${slotId.replace(/^\D+/, "")}`;
}
