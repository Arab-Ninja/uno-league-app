import { describe, expect, it } from "vitest";
import {
  PITCH_TEAM_SIZES,
  defaultFormation,
  formationFor,
  formationsFor,
  isFormation,
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
  it("MODE-003 — chaque formation a exactement autant de places que de joueurs", () => {
    // La règle qui compte : une place de trop laisse un trou sur le terrain,
    // une de moins laisse quelqu'un sur le banc d'une séance sans remplaçant.
    // Elle vaut pour **chaque** forme proposée, pas seulement pour le défaut.
    for (const size of PITCH_TEAM_SIZES) {
      for (const { id } of formationsFor(size)) {
        expect(pitchSlotsFor(size, id), `${id} à ${size}`).toHaveLength(size);
      }
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
      for (const { id } of formationsFor(size)) {
        const keepers = pitchSlotsFor(size, id).filter(
          (slot) => slot.role === "GB",
        );
        expect(keepers, `${id} à ${size}`).toHaveLength(1);
        expect(keepers[0]!.id).toBe("GB");
      }
    }
  });

  it("MODE-003 — les places sont uniques dans une formation", () => {
    for (const size of PITCH_TEAM_SIZES) {
      for (const { id } of formationsFor(size)) {
        const ids = pitchSlotsFor(size, id).map((slot) => slot.id);
        expect(new Set(ids).size, `${id} à ${size}`).toBe(ids.length);
      }
    }
  });

  it("MODE-003 — les rangées vont de l'attaque au but", () => {
    const rows = formationFor(11);
    expect(rows.map((row) => row[0]?.role)).toEqual([
      "ATT",
      "MIL",
      "DEF",
      "GB",
    ]);
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

  it("PITCH-001 — le défaut de chaque effectif est ce qui se jouait avant", () => {
    // Une séance déjà composée garde exactement son terrain : le premier de
    // la liste est l'ancienne forme figée, sans quoi les équipes existantes
    // se retrouveraient redessinées un matin.
    expect(defaultFormation(5)).toBe("1-1-2-1");
    expect(defaultFormation(7)).toBe("1-3-2-1");
    expect(defaultFormation(8)).toBe("1-3-3-1");
    expect(defaultFormation(9)).toBe("1-4-3-1");
    expect(defaultFormation(10)).toBe("1-4-4-1");
    expect(defaultFormation(11)).toBe("1-4-4-2");
    expect(defaultFormation(6)).toBeNull();
  });

  it("PITCH-001 — chaque effectif propose au moins deux formes, sans doublon", () => {
    for (const size of PITCH_TEAM_SIZES) {
      const ids = formationsFor(size).map((row) => row.id);
      expect(ids.length, `formes à ${size}`).toBeGreaterThanOrEqual(2);
      expect(new Set(ids).size, `formes à ${size}`).toBe(ids.length);
    }
  });

  it("PITCH-001 — la notation dit la forme, gardien compris", () => {
    // Un joueur lit « 1-3-1 » et sait ce qu'il verra. C'est aussi ce qui part
    // en base : la notation est stable et ne se traduit pas.
    expect(formationsFor(5).map((row) => row.id)).toEqual([
      "1-1-2-1",
      "1-2-2",
      "1-3-1",
      "1-4",
    ]);
  });

  it("PITCH-001 — une ligne vide ne creuse pas de trou sur le terrain", () => {
    // Le 1-2-2 n'a pas de milieu : la rangée ne doit pas être rendue vide.
    const rows = formationFor(5, "1-2-2");
    expect(rows.map((row) => row.map((slot) => slot.id))).toEqual([
      ["ATT1", "ATT2"],
      ["DEF1", "DEF2"],
      ["GB"],
    ]);
  });

  it("PITCH-001 — changer de forme change les places valables", () => {
    // C'est tout l'enjeu du stockage : DEF2 existe en 1-2-2 et pas en 1-3-1,
    // donc un joueur placé là doit être délogé au changement de forme.
    expect(isPitchSlot(5, "DEF2", "1-2-2")).toBe(true);
    expect(isPitchSlot(5, "DEF2", "1-3-1")).toBe(false);
    expect(isPitchSlot(5, "MIL3", "1-3-1")).toBe(true);
    expect(isPitchSlot(5, "MIL3", "1-1-2-1")).toBe(false);
  });

  it("PITCH-001 — une forme inconnue retombe sur le défaut", () => {
    // Une équipe composée avant qu'une forme ne soit retirée du catalogue
    // garde un terrain lisible : il change de dessin, il ne disparaît pas.
    expect(formationFor(5, "1-9-9")).toEqual(formationFor(5));
    expect(isFormation(5, "1-2-2")).toBe(true);
    expect(isFormation(5, "1-4-4-2")).toBe(false);
    expect(isFormation(11, "1-4-4-2")).toBe(true);
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
