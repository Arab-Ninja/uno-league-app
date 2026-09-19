import { describe, expect, it } from "vitest";
import {
  getGameMode,
  venuesForMode,
  type BookableVenue,
} from "./constants.js";

/**
 * Le mode Grand Foot et la règle des lieux (MODE-003).
 *
 * Ce fichier ne teste pas un écran : il fige les deux décisions qui, prises à
 * l'envers, feraient jouer un futsal à cinq sur un terrain à onze — ou
 * verseraient des UNO pour un match qui ne doit rien rapporter.
 */

const LIEUX: BookableVenue[] = [
  { slug: "fit-five-forest" },
  { slug: "arena", reservedModeId: null },
  { slug: "londerzeel", reservedModeId: "bigfoot" },
];

describe("lieux offerts par mode (MODE-003)", () => {
  it("MODE-003 — un mode qui a un lieu réservé ne voit que celui-là", () => {
    // C'est ce qui fait du grand foot un mode à un seul terrain, sans qu'on
    // ait à l'écrire dans le mode.
    expect(venuesForMode(LIEUX, "bigfoot").map((v) => v.slug)).toEqual([
      "londerzeel",
    ]);
  });

  it("MODE-003 — les autres modes ne voient jamais un lieu réservé", () => {
    const offerts = venuesForMode(LIEUX, "friendly").map((v) => v.slug);
    expect(offerts).toEqual(["fit-five-forest", "arena"]);
    expect(offerts).not.toContain("londerzeel");
  });

  it("MODE-003 — sans aucune réservation, chacun retrouve la liste commune", () => {
    // Le comportement le moins surprenant si l'on retire les réservations.
    const communs = [{ slug: "arena" }, { slug: "yc-five" }];
    expect(venuesForMode(communs, "bigfoot")).toHaveLength(2);
  });
});

describe("le mode Grand Foot (MODE-003)", () => {
  const mode = getGameMode("bigfoot")!;

  it("MODE-003 — il est gratuit, donc rien n'est à régler", () => {
    expect(mode.priceEur).toBe(0);
  });

  it("MODE-003 — il ne laisse aucune trace au dossier, XP comprise", () => {
    /*
     * L'XP mérite son assertion. Elle était acquise dans tous les modes, et
     * chaque palier de niveau verse des UNO : la laisser passer ici ouvrirait
     * une porte dérobée vers le portefeuille d'un mode qui ne doit rien
     * rapporter.
     */
    expect(mode.effects).toEqual({
      careerStats: false,
      unoRewards: false,
      divisionMovement: false,
      cardRating: false,
      xp: false,
    });
    expect(mode.ranked).toBe(false);
  });

  it("MODE-003 — l'effectif va de sept à onze par équipe", () => {
    expect(mode.teamSizeRange).toEqual({ min: 7, max: 11 });
    // Le plancher du mode vaut le double du plus petit effectif.
    expect(mode.minParticipants).toBe(14);
  });

  it("MODE-003 — les joueurs choisissent leur camp, et le délai est court", () => {
    expect(mode.playersChooseSide).toBe(true);
    expect(mode.minLeadHours).toBe(4);
  });

  it("MODE-003 — les autres modes gardent leurs règles", () => {
    // Le garde-fou : ces champs sont optionnels, et une valeur qui déborderait
    // sur la League s'y verrait tout de suite.
    const league = getGameMode("league")!;
    expect(league.teamSizeRange).toBeUndefined();
    expect(league.playersChooseSide).toBeUndefined();
    expect(league.minLeadHours).toBeUndefined();
    expect(league.effects.xp).toBe(true);
  });
});
