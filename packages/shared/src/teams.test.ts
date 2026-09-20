import { describe, expect, it } from "vitest";
import { completeTeams, teamRating } from "./teams.js";

/**
 * Le tirage qui complète les indécis (MODE-005).
 *
 * En UNO League, chacun choisit son équipe tant qu'il y reste de la place.
 * Le tirage ne disparaît pas pour autant : à la clôture, il place ceux qui
 * n'ont rien dit, et il doit le faire de façon à rapprocher les trois
 * équipes — sans quoi le choix libre se lirait au tableau final.
 */

/** Des joueurs numérotés, de force décroissante : 100, 90, 80… */
function joueurs(...notes: number[]) {
  return notes.map((rating, index) => ({ id: index + 1, rating }));
}

describe("tirage de complément (MODE-005)", () => {
  it("MODE-005 — ceux qui ont choisi gardent leur équipe", () => {
    const [a, b, c] = joueurs(90, 80, 70);
    const { teams } = completeTeams(
      [[a!], [b!], [c!]],
      joueurs(60, 50, 40).map((p) => ({ ...p, id: p.id + 10 })),
      2,
      7,
    );

    expect(teams[0]!.map((p) => p.id)).toContain(a!.id);
    expect(teams[1]!.map((p) => p.id)).toContain(b!.id);
    expect(teams[2]!.map((p) => p.id)).toContain(c!.id);
  });

  it("MODE-005 — les plus forts vont aux équipes les plus faibles", () => {
    /*
     * L'équipe A part avec 100, la B avec 50, la C vide. Les deux renforts
     * valent 40 et 30 : la logique veut que le plus fort aille à la plus
     * faible. Rien ici ne dépend du mélange — les deux joueurs ne sont pas
     * dans le même tour, puisque deux équipes seulement peuvent recevoir.
     */
    const forts = joueurs(100, 50);
    const { teams } = completeTeams(
      [[forts[0]!], [forts[1]!], []],
      [
        { id: 30, rating: 40 },
        { id: 31, rating: 30 },
      ],
      1,
      3,
    );

    expect(teams[0]!.map((p) => p.id)).toEqual([1]);
    expect(teams[1]!.map((p) => p.id)).toEqual([2]);
    expect(teams[2]!.map((p) => p.id)).toEqual([30]);
  });

  it("MODE-005 — l'effectif n'est jamais dépassé, et le reste est rendu", () => {
    const { teams, unassigned } = completeTeams(
      [[], [], []],
      joueurs(...Array.from({ length: 17 }, (_, i) => 100 - i)),
      5,
      42,
    );

    for (const squad of teams) expect(squad).toHaveLength(5);
    expect(unassigned).toHaveLength(2);
    // Ceux qui restent dehors sont les plus faibles : le tirage sert d'abord
    // ceux qui jouent.
    expect(unassigned.map((p) => p.rating)).toEqual([85, 84]);
  });

  it("MODE-005 — une séance où personne n'a choisi reste équilibrée, quelle que soit la graine", () => {
    /*
     * Le cas d'avant MODE-005, qui doit continuer à bien se comporter :
     * quinze indécis, trois équipes vides. C'est le cas le plus fréquent —
     * choisir son équipe reste une option, et la plupart des séances se
     * rempliront de gens qui ne l'exercent pas.
     *
     * Le seuil n'est pas choisi au hasard : sur cinq cents graines, l'écart
     * maximal observé est de 4 pour ce tirage-ci, contre 18 pour le tirage
     * par chapeaux qu'il remplace. On vérifie donc à la fois qu'il équilibre
     * et qu'il ne régresse pas.
     */
    const plateau = joueurs(
      ...Array.from({ length: 15 }, (_, i) => 90 - i * 2),
    );

    for (let graine = 1; graine <= 50; graine++) {
      const forces = completeTeams([[], [], []], plateau, 5, graine).teams.map(
        teamRating,
      );
      expect(
        Math.max(...forces) - Math.min(...forces),
        `graine ${graine}`,
      ).toBeLessThanOrEqual(6);
    }
  });

  it("MODE-005 — deux séances identiques ne donnent pas les mêmes équipes", () => {
    /*
     * Sans cela, les mêmes quinze joueurs formeraient éternellement les mêmes
     * trois équipes : chacun saurait d'avance ce que le tirage lui réserve,
     * et la seule façon d'en changer serait de choisir — ce qui viderait le
     * tirage de son sens.
     */
    const plateau = joueurs(
      ...Array.from({ length: 15 }, (_, i) => 90 - i * 2),
    );
    const vues = new Set(
      Array.from({ length: 20 }, (_, graine) =>
        completeTeams([[], [], []], plateau, 5, graine + 1)
          .teams.map((squad) =>
            squad
              .map((p) => p.id)
              .sort((a, b) => a - b)
              .join(","),
          )
          .join("|"),
      ),
    );

    expect(vues.size).toBeGreaterThan(10);
  });

  it("MODE-005 — rattrape une équipe que le choix libre a déséquilibrée", () => {
    /*
     * Le cas qui a motivé la règle : trois amis forts se retrouvent dans la
     * même équipe. Le tirage n'a pas le pouvoir de les séparer — c'est le
     * marché passé avec eux —, mais il doit renforcer les deux autres.
     */
    const amis = [
      { id: 1, rating: 95 },
      { id: 2, rating: 93 },
      { id: 3, rating: 90 },
    ];
    const reste = Array.from({ length: 12 }, (_, i) => ({
      id: 10 + i,
      rating: 80 - i * 2,
    }));

    const { teams } = completeTeams([amis, [], []], reste, 5, 99);
    const forces = teams.map(teamRating);

    // L'équipe des amis reste la plus forte : on ne défait pas leur choix.
    expect(forces[0]).toBeGreaterThan(forces[1]!);
    // Mais l'écart est celui de leurs deux places restantes, pas celui de
    // cinq joueurs : sans rattrapage il dépasserait cent points.
    expect(forces[0]! - Math.min(forces[1]!, forces[2]!)).toBeLessThan(60);
    // Et les deux équipes complétées se valent.
    expect(Math.abs(forces[1]! - forces[2]!)).toBeLessThanOrEqual(6);
  });

  it("MODE-005 — le même tirage rejoué donne le même résultat", () => {
    const plateau = joueurs(...Array.from({ length: 12 }, (_, i) => 88 - i));
    const une = completeTeams([[], [], []], plateau, 5, 2024);
    const deux = completeTeams([[], [], []], plateau, 5, 2024);

    expect(deux.teams.map((squad) => squad.map((p) => p.id))).toEqual(
      une.teams.map((squad) => squad.map((p) => p.id)),
    );
  });

  it("MODE-005 — un joueur déjà assis n'est pas replacé ailleurs", () => {
    // La liste des indécis est construite par une requête : qu'elle y glisse
    // quelqu'un de déjà assis ne doit pas le dédoubler sur le terrain.
    const assis = { id: 1, rating: 70 };
    const { teams } = completeTeams(
      [[assis], [], []],
      [assis, { id: 2, rating: 60 }],
      5,
      5,
    );

    const tous = teams.flat().map((p) => p.id);
    expect(tous.filter((id) => id === 1)).toHaveLength(1);
    expect(tous).toHaveLength(2);
  });

  it("MODE-005 — sans équipe, personne n'est placé", () => {
    const { teams, unassigned } = completeTeams([], joueurs(50, 40), 5, 1);
    expect(teams).toEqual([]);
    expect(unassigned).toHaveLength(2);
  });
});
