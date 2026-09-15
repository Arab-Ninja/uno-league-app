import { describe, expect, it } from "vitest";
import {
  TOURNAMENT_ROUND_LABELS,
  TOURNAMENT_SIZES,
  isTournamentSize,
  matchesInRound,
  needsShootout,
  nextRound,
  nextSide,
  nextSlot,
  roundsOf,
  seedPairs,
} from "./tournaments.js";

describe("tournois : forme du tableau (TOUR-001)", () => {
  it("chaque taille commence au bon tour", () => {
    expect(roundsOf(32)).toEqual(["of32", "of16", "quarter", "semi", "final"]);
    expect(roundsOf(16)).toEqual(["of16", "quarter", "semi", "final"]);
    expect(roundsOf(8)).toEqual(["quarter", "semi", "final"]);
    // Quatre clubs : on entre en demi-finales, pas en quarts. Afficher des
    // quarts à quatre aurait promis deux affiches qui n'existent pas.
    expect(roundsOf(4)).toEqual(["semi", "final"]);
  });

  it("le nombre d'affiches divise le plateau par deux à chaque tour", () => {
    for (const size of TOURNAMENT_SIZES) {
      const counts = roundsOf(size).map(matchesInRound);
      expect(counts[0]).toBe(size / 2);
      expect(counts[counts.length - 1]).toBe(1);
      // Un tableau complet compte une affiche de moins que de clubs.
      expect(counts.reduce((total, value) => total + value, 0)).toBe(size - 1);
    }
  });

  it("les tours portent leur nom français", () => {
    expect(TOURNAMENT_ROUND_LABELS.of32).toBe("16es de finale");
    expect(TOURNAMENT_ROUND_LABELS.of16).toBe("8es de finale");
    expect(TOURNAMENT_ROUND_LABELS.final).toBe("Finale");
  });

  it("la finale ne mène nulle part", () => {
    expect(nextRound("quarter")).toBe("semi");
    expect(nextRound("semi")).toBe("final");
    expect(nextRound("final")).toBeNull();
  });

  it("les têtes de série s'apparient par les deux bouts", () => {
    // Le premier rencontre le dernier : sans cela, les deux meilleurs clubs
    // peuvent se croiser d'entrée et la finale opposer les deux plus faibles.
    expect(seedPairs([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
    expect(seedPairs([1, 2, 3, 4])).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });

  it("deux affiches voisines se rejoignent au tour suivant", () => {
    expect(nextSlot(0)).toBe(0);
    expect(nextSlot(1)).toBe(0);
    expect(nextSlot(2)).toBe(1);
    expect(nextSlot(3)).toBe(1);

    // Et elles occupent chacune leur côté : sans cela, deux vainqueurs
    // écriraient dans la même case et l'un effacerait l'autre.
    expect(nextSide(0)).toBe("home");
    expect(nextSide(1)).toBe("away");
    expect(nextSide(2)).toBe("home");
    expect(nextSide(3)).toBe("away");
  });

  it("un score nul appelle les tirs au but", () => {
    expect(needsShootout(2, 2)).toBe(true);
    expect(needsShootout(3, 1)).toBe(false);
  });

  it("une taille hors puissance de deux est refusée", () => {
    expect(isTournamentSize(8)).toBe(true);
    // Six clubs auraient exigé des exempts, donc une faveur à justifier.
    expect(isTournamentSize(6)).toBe(false);
    expect(isTournamentSize(64)).toBe(false);
  });
});
