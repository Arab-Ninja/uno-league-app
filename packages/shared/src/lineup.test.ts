import { describe, expect, it } from "vitest";
import {
  LINEUP_SLOTS,
  compareForRoster,
  composeLineup,
  lineupFromAssignments,
  resolveLineup,
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

describe("cinq type d'un club (CLUB-001)", () => {
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
    expect(lineup.find((p) => p.slot === "AILE_G")?.player?.id).toBe(2);
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
    // montre en attaque, et l'aile revient au deuxième passeur.
    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(1);
    expect(lineup.find((p) => p.slot === "AILE_G")?.player?.id).toBe(2);
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
    expect(lineup.find((p) => p.slot === "AILE_G")?.player?.id).toBe(2);
    // Le meilleur défenseur disponible défend, au lieu de garder les buts.
    expect(lineup.find((p) => p.slot === "DEF")?.player?.id).toBe(3);

    /*
     * Et le cinquième emplacement corrige ce qui restait de travers : avec
     * quatre places, le buteur aux vingt-neuf passes et à l'unique arrêt
     * finissait dans les buts, faute de mieux. Il prend maintenant la seconde
     * aile, qui est sa place, et le poste de gardien reste vide.
     *
     * Vide est la bonne réponse : ce club n'a pas de gardien, et l'annoncer
     * vaut mieux que de déguiser un attaquant en portier pour un arrêt.
     */
    expect(lineup.find((p) => p.slot === "AILE_D")?.player?.id).toBe(1);
    expect(lineup.find((p) => p.slot === "GB")?.player).toBeNull();
  });

  it("le gardien déclaré garde les buts, même s'il défend bien", () => {
    /*
     * L'effectif des Faucons, tel qu'il a cassé le terrain à l'écran. Thomas
     * Peeters est gardien et compte cent quarante-cinq arrêts — mais il touche
     * tant de ballons qu'il mène aussi les défenses. La défense se servant
     * avant les buts, il partait en défense centrale, et les buts revenaient à
     * Antoine Leroy, défenseur, pour deux arrêts.
     *
     * Gardien est un rôle, pas un classement : on ne monte pas son portier en
     * défense parce qu'il y a bien récupéré de ballons.
     */
    const squad = [
      player(1, { saves: 145, defenses: 91, assists: 14, goals: 3, position: "GB", rating: 86 }),
      player(2, { saves: 1, defenses: 56, assists: 36, goals: 22, position: "MIL", rating: 84 }),
      player(3, { saves: 1, defenses: 79, assists: 41, goals: 21, position: "DEF", rating: 84 }),
      player(4, { saves: 2, defenses: 56, assists: 27, goals: 14, position: "DEF", rating: 72 }),
      player(5, { saves: 1, defenses: 23, assists: 35, goals: 26, position: "ATT", rating: 71 }),
    ];

    const lineup = composeLineup(squad);
    expect(lineup.find((p) => p.slot === "GB")?.player?.id).toBe(1);
    expect(lineup.find((p) => p.slot === "GB")?.value).toBe(145);
    // Et les trois postes de champ restent statistiques : le meilleur buteur
    // attaque, le meilleur passeur prend une aile.
    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(5);
    expect(lineup.find((p) => p.slot === "AILE_G")?.player?.id).toBe(3);
    expect(lineup.find((p) => p.slot === "DEF")?.player?.id).toBe(4);
  });

  it("un gardien déclaré sans le moindre arrêt ne prend pas la place", () => {
    // Il s'est inscrit gardien et n'a jamais gardé : une carte à zéro arrêt
    // n'est pas une mise en avant. Le poste retombe alors dans l'ordre de
    // service ordinaire, où il revient à qui a réellement arrêté.
    const lineup = composeLineup([
      player(1, { saves: 0, position: "GB" }),
      player(2, { saves: 6, position: "MIL" }),
    ]);
    expect(lineup.find((p) => p.slot === "GB")?.player?.id).toBe(2);
    expect(lineup.find((p) => p.slot === "GB")?.value).toBe(6);
  });

  it("la seconde aile revient au deuxième passeur, après la défense", () => {
    /*
     * Le cinquième emplacement, ajouté pour que « le cinq type » cesse de
     * mentir au-dessus de quatre cartes.
     *
     * Il se sert **après** la défense : « meilleur défenseur du club » est un
     * titre plus fort que « deuxième passeur ». Servi avant, il aurait déplacé
     * les quatre premiers, et le terrain aurait changé sous les yeux des clubs
     * sans qu'aucun joueur n'ait touché un ballon.
     */
    const squad = [
      player(1, { goals: 30, assists: 10, position: "ATT" }),
      player(2, { assists: 40, defenses: 5, position: "MIL" }),
      player(3, { assists: 22, defenses: 60, position: "DEF" }),
      player(4, { assists: 18, defenses: 12, position: "MIL" }),
      player(5, { saves: 20, position: "GB" }),
    ];

    const lineup = composeLineup(squad);

    expect(lineup).toHaveLength(5);
    expect(lineup.map((pick) => pick.slot)).toEqual([...LINEUP_SLOTS]);

    expect(lineup.find((p) => p.slot === "ATT")?.player?.id).toBe(1);
    expect(lineup.find((p) => p.slot === "AILE_G")?.player?.id).toBe(2);
    // Le meilleur défenseur défend, bien qu'il soit deuxième passeur.
    expect(lineup.find((p) => p.slot === "DEF")?.player?.id).toBe(3);
    // La seconde aile prend donc le suivant.
    expect(lineup.find((p) => p.slot === "AILE_D")?.player?.id).toBe(4);
    expect(lineup.find((p) => p.slot === "GB")?.player?.id).toBe(5);

    // Et personne n'occupe deux emplacements.
    const places = lineup.map((pick) => pick.player?.id).filter(Boolean);
    expect(new Set(places).size).toBe(5);
  });

  it("un effectif de quatre laisse la seconde aile vide", () => {
    // Le cinquième emplacement ne se comble pas avec quelqu'un qui n'a jamais
    // fait de passe : un club de quatre reste un club de quatre.
    const lineup = composeLineup([
      player(1, { goals: 12, position: "ATT" }),
      player(2, { assists: 8, position: "MIL" }),
      player(3, { defenses: 15, position: "DEF" }),
      player(4, { saves: 9, position: "GB" }),
    ]);

    expect(lineup.find((p) => p.slot === "AILE_D")?.player).toBeNull();
    expect(lineup.find((p) => p.slot === "AILE_G")?.player?.id).toBe(2);
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

describe("composition enregistrée (CLUB-002)", () => {
  const squad = [
    player(1, { goals: 12, position: "ATT" }),
    player(2, { assists: 9, position: "MIL" }),
    player(3, { defenses: 20, position: "DEF" }),
    player(4, { saves: 31, position: "GB" }),
    player(5, { goals: 3, assists: 2 }),
  ];

  it("sans composition, le terrain reste celui des statistiques", () => {
    expect(resolveLineup(squad, [])).toEqual(composeLineup(squad));
  });

  it("la composition du club l'emporte sur la déduction", () => {
    // Le gardien à la pointe et le buteur dans les buts : absurde
    // sportivement, et c'est bien le sujet — l'entraîneur décide, pas les
    // chiffres.
    const lineup = resolveLineup(squad, [
      { slot: "ATT", playerId: 4 },
      { slot: "GB", playerId: 1 },
    ]);

    expect(lineup.find((pick) => pick.slot === "ATT")?.player?.id).toBe(4);
    expect(lineup.find((pick) => pick.slot === "GB")?.player?.id).toBe(1);
  });

  it("un emplacement non composé reste vide, sans repêchage", () => {
    const lineup = resolveLineup(squad, [{ slot: "GB", playerId: 4 }]);

    expect(lineup.find((pick) => pick.slot === "GB")?.player?.id).toBe(4);
    for (const slot of ["DEF", "AILE_G", "AILE_D", "ATT"] as const) {
      expect(lineup.find((pick) => pick.slot === slot)?.player).toBeNull();
    }
  });

  it("un joueur qui a quitté le club libère son emplacement", () => {
    const lineup = resolveLineup(squad, [
      { slot: "ATT", playerId: 1 },
      // 99 n'est plus de l'effectif : sa ligne survit, sa carte non.
      { slot: "DEF", playerId: 99 },
    ]);

    expect(lineup.find((pick) => pick.slot === "ATT")?.player?.id).toBe(1);
    expect(lineup.find((pick) => pick.slot === "DEF")?.player).toBeNull();
  });

  it("le même joueur ne s'affiche jamais à deux endroits", () => {
    // Le premier emplacement de l'ordre du terrain le garde : la défense
    // précède l'attaque, donc c'est l'attaque qui reste vide.
    const lineup = resolveLineup(squad, [
      { slot: "ATT", playerId: 1 },
      { slot: "DEF", playerId: 1 },
    ]);

    expect(lineup.filter((pick) => pick.player?.id === 1)).toHaveLength(1);
    expect(lineup.find((pick) => pick.slot === "DEF")?.player?.id).toBe(1);
    expect(lineup.find((pick) => pick.slot === "ATT")?.player).toBeNull();
  });

  it("rend toujours les cinq emplacements, dans l'ordre du terrain", () => {
    const lineup = resolveLineup(squad, [{ slot: "ATT", playerId: 1 }]);
    expect(lineup.map((pick) => pick.slot)).toEqual([...LINEUP_SLOTS]);
  });

  it("une composition vide donne un terrain vide, sans repli", () => {
    // L'écran de composition s'en sert : vider le dernier emplacement doit
    // vider le terrain, pas y faire surgir le cinq statistique.
    const lineup = lineupFromAssignments(squad, []);
    expect(lineup.map((pick) => pick.slot)).toEqual([...LINEUP_SLOTS]);
    expect(lineup.every((pick) => pick.player === null)).toBe(true);
  });
});
