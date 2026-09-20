import { describe, expect, it } from "vitest";
import {
  PITCH_TEAM_SIZES,
  formationFor,
  isPitchSlot,
  pitchSlotLabel,
  pitchSlotsFor,
} from "./pitch.js";

/**
 * Les places du terrain de Grand Foot (MODE-003).
 *
 * Ce qui compte ici tient en une phrase : une formation doit avoir exactement
 * autant de places que de joueurs. Une de trop laisse un trou sur le terrain,
 * une de moins laisse quelqu'un sur le banc d'une séance où personne n'est
 * remplaçant.
 */
describe("formations du Grand Foot (MODE-003)", () => {
  it("MODE-003 — chaque effectif a exactement autant de places que de joueurs", () => {
    for (const size of PITCH_TEAM_SIZES) {
      expect(pitchSlotsFor(size), `formation à ${size}`).toHaveLength(size);
    }
  });

  it("MODE-003 — les effectifs couverts vont de cinq à onze", () => {
    // Cinq pour le futsal — l'amical et la UNO League (MODE-004) —, sept à
    // onze pour le gazon du Grand Foot.
    expect(PITCH_TEAM_SIZES).toEqual([5, 7, 8, 9, 10, 11]);
  });

  it("MODE-004 — à cinq, le terrain parle futsal : un fixo, deux ailes, un pivot", () => {
    const rows = formationFor(5);
    expect(rows.map((row) => row.length)).toEqual([1, 2, 1, 1]);
    // « Milieu » serait une traduction molle de ce que le futsal appelle une
    // aile : la forme est la même que le terrain d'un club.
    expect(pitchSlotLabel(5, "MIL1")).toBe("Aile 1");
    expect(pitchSlotLabel(5, "MIL2")).toBe("Aile 2");
    expect(pitchSlotLabel(5, "DEF1")).toBe("Défense");
    expect(pitchSlotLabel(5, "ATT1")).toBe("Attaque");
    expect(pitchSlotLabel(5, "GB")).toBe("Gardien");
  });

  it("MODE-003 — chaque formation a un gardien, et un seul", () => {
    for (const size of PITCH_TEAM_SIZES) {
      const keepers = pitchSlotsFor(size).filter((slot) => slot.role === "GB");
      expect(keepers, `formation à ${size}`).toHaveLength(1);
      expect(keepers[0]!.id).toBe("GB");
    }
  });

  it("MODE-003 — les places sont uniques dans une formation", () => {
    for (const size of PITCH_TEAM_SIZES) {
      const ids = pitchSlotsFor(size).map((slot) => slot.id);
      expect(new Set(ids).size, `formation à ${size}`).toBe(ids.length);
    }
  });

  it("MODE-003 — les rangées vont de l'attaque au but", () => {
    const rows = formationFor(11);
    expect(rows.map((row) => row[0]?.role)).toEqual(["ATT", "MIL", "DEF", "GB"]);
    // Le terrain plein, c'est un 4-4-2 : deux pointes, et une seule ailleurs.
    expect(rows.map((row) => row.length)).toEqual([2, 4, 4, 1]);
  });

  it("MODE-003 — un effectif hors bornes ne rend aucune formation", () => {
    // Rendre une grille inventée aurait affiché un terrain faux plutôt que
    // rien, ce qui est pire : on ne cherche pas la panne.
    expect(formationFor(6)).toEqual([]);
    expect(formationFor(12)).toEqual([]);
    expect(pitchSlotsFor(0)).toEqual([]);
  });

  it("MODE-003 — une place d'une formation n'appartient pas forcément aux autres", () => {
    // DEF4 existe à neuf, pas à sept : un plateau réduit doit refuser la
    // place d'un plateau plein.
    expect(isPitchSlot(9, "DEF4")).toBe(true);
    expect(isPitchSlot(7, "DEF4")).toBe(false);
    expect(isPitchSlot(7, "GB")).toBe(true);
    expect(isPitchSlot(11, "ATT2")).toBe(true);
    expect(isPitchSlot(10, "ATT2")).toBe(false);
  });

  it("MODE-003 — une ligne unique ne se numérote pas", () => {
    // « Attaque 1 » n'a aucun sens quand il n'y a qu'une pointe.
    expect(pitchSlotLabel(10, "ATT1")).toBe("Attaque");
    expect(pitchSlotLabel(11, "ATT1")).toBe("Attaque 1");
    expect(pitchSlotLabel(11, "MIL3")).toBe("Milieu 3");
    expect(pitchSlotLabel(11, "GB")).toBe("Gardien");
    expect(pitchSlotLabel(7, "DEF4")).toBeNull();
  });
});
