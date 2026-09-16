import { describe, expect, it } from "vitest";
import {
  LINEUP_SLOTS,
  compareForRoster,
  composeLineup,
  type LineupCandidate,
} from "./lineup.js";

function player(
  id: number,
  overrides: Partial<LineupCandidate> = {},
): LineupCandidate {
  return {
    id,
    position: "MIL",
    goals: 0,
    assists: 0,
    defenses: 0,
    saves: 0,
    matchesPlayed: 10,
    rating: 70,
    ...overrides,
  };
}

describe("onze type d'un club (CLUB-001)", () => {
  it("place le meilleur de chaque statistique à son poste", () => {
    const squad = [
      player(1, { goals: 12, position: "ATT" }),
      player(2, { assists: 9, position: "MIL" }),
      player(3, { defenses: 20, position: "DEF" }),
      player(4, { saves: 31, position: "GB" }),
      player(5, { goals: 3, assists: 2 }),
    ];

    const lineup = composeLineup(squad);
    expect(lineup.map((pick) => pick.slot)).toEqual([...LINEUP_SLOTS]);
    expect(lineup.find((p) => p.slot === "GB")?.player?.id).toBe(4);
    expect(lineup.find((p) => p.slot === "DEF")?.player?.id).toBe(3);
    expect(lineup.find((p) => p.slot === "MIL")?.player?.id).toBe(2);
    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(1);
  });

  it("ne place jamais le même joueur à deux postes", () => {
    // Le meilleur buteur est aussi le meilleur passeur : le montrer deux fois
    // donnerait un terrain à deux joueurs pour un club qui en compte cinq.
    const squad = [
      player(1, { goals: 20, assists: 15 }),
      player(2, { assists: 4 }),
      player(3, { defenses: 6 }),
    ];

    const lineup = composeLineup(squad);
    const placed = lineup
      .map((pick) => pick.player?.id)
      .filter((id): id is number => id !== undefined && id !== null);

    expect(new Set(placed).size).toBe(placed.length);
    // Le buteur va à la pointe, pas au milieu : un club qui a un buteur le
    // montre en attaque, et le milieu revient au deuxième passeur.
    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(1);
    expect(lineup.find((p) => p.slot === "MIL")?.player?.id).toBe(2);
    expect(lineup.find((p) => p.slot === "DEF")?.player?.id).toBe(3);
  });

  it("laisse un poste vide plutôt que d'y mettre quelqu'un à zéro", () => {
    // Une carte de mise en avant qui annonce zéro arrêt ne met rien en avant.
    const lineup = composeLineup([player(1, { goals: 5 })]);
    expect(lineup.find((p) => p.slot === "GB")?.player).toBeNull();
    expect(lineup.find((p) => p.slot === "GB")?.value).toBe(0);
    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(1);
  });

  it("à statistique égale, le poste déclaré tranche", () => {
    // Un attaquant qui a fait trois arrêts a dépanné ; il n'est pas gardien.
    const lineup = composeLineup([
      player(1, { saves: 3, position: "ATT" }),
      player(2, { saves: 3, position: "GB" }),
    ]);
    expect(lineup.find((p) => p.slot === "GB")?.player?.id).toBe(2);
  });

  it("le même effectif donne toujours le même terrain", () => {
    const squad = [
      player(1, { goals: 4, rating: 80 }),
      player(2, { goals: 4, rating: 80 }),
      player(3, { goals: 4, rating: 80 }),
    ];
    const first = composeLineup(squad).map((p) => p.player?.id);
    const second = composeLineup([...squad].reverse()).map((p) => p.player?.id);
    expect(second).toEqual(first);
  });

  it("les arrêts ne volent pas le meilleur défenseur", () => {
    /*
     * L'effectif du jeu d'essai, tel qu'il a cassé le terrain au premier
     * affichage. Personne n'est gardien : les arrêts se comptent sur les
     * doigts d'une main et ne désignent personne. Servis en premier, ils
     * envoyaient Samir — cinquante-cinq défenses — dans les buts pour deux
     * arrêts, et la défense revenait à un joueur qui en avait treize.
     */
    const squad = [
      player(1, { goals: 41, assists: 29, defenses: 6, saves: 1, position: "ATT" }),
      player(2, { goals: 27, assists: 40, defenses: 55, saves: 2, position: "MIL" }),
      player(3, { goals: 24, assists: 29, defenses: 48, saves: 1, position: "MIL" }),
      player(4, { goals: 47, assists: 27, defenses: 21, saves: 1, position: "ATT" }),
      player(5, { goals: 5, assists: 4, defenses: 13, saves: 0, position: "MIL" }),
    ];

    const lineup = composeLineup(squad);
    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(4);
    expect(lineup.find((p) => p.slot === "MIL")?.player?.id).toBe(2);
    // Le meilleur défenseur disponible défend, au lieu de garder les buts.
    expect(lineup.find((p) => p.slot === "DEF")?.player?.id).toBe(3);
    expect(lineup.find((p) => p.slot === "GB")?.player?.id).toBe(1);
  });

  it("le classement de l'effectif suit la note, puis les buts", () => {
    const squad = [
      player(1, { rating: 70, goals: 9 }),
      player(2, { rating: 84, goals: 1 }),
      player(3, { rating: 84, goals: 7 }),
    ];
    expect([...squad].sort(compareForRoster).map((p) => p.id)).toEqual([3, 2, 1]);
  });
});
