import { beforeEach, describe, expect, it } from "vitest";
import {
  createFundedPlayer as createPlayer,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * La forme du terrain d'un club et d'une feuille de tournoi (CLUB-003).
 *
 * **Ce qui change.** Le cinq d'un club était un losange : un gardien, un
 * fixo, deux ailes, un pivot, et rien d'autre n'était dessinable. Il aligne
 * désormais ce que le futsal aligne — le carré, la ligne de trois derrière un
 * pivot, les quatre de front — comme n'importe quelle équipe de la ligue.
 *
 * Ces tests portent sur ce que la forme rend possible, et surtout sur ce
 * qu'elle interdit : une place qu'elle ne dessine pas n'existe pas, et
 * l'enregistrer aurait rangé une carte là où personne ne la verrait.
 */

async function found(player: TestPlayer, name: string): Promise<number> {
  const squad = await player.caller.squads.create({ name });
  return squad.id;
}

async function join(
  player: TestPlayer,
  decider: TestPlayer,
  squadId: number,
): Promise<void> {
  await player.caller.squads.requestToJoin({ squadId });
  const detail = await decider.caller.squads.detail({ squadId });
  const request = detail.pendingRequests.find(
    (row) => row.player.id === player.identity.playerId,
  )!;
  await decider.caller.squads.decideRequest({
    requestId: request.id,
    accept: true,
  });
}

describe("la forme du terrain d'un club (CLUB-003)", () => {
  let founder: TestPlayer;
  let member: TestPlayer;
  let squadId: number;

  beforeEach(async () => {
    await resetDatabase();
    founder = await createPlayer();
    member = await createPlayer();
    squadId = await found(founder, "Les Loups");
    await join(member, founder, squadId);
  });

  it("CLUB-003 — sans rien choisir, le club garde le losange du futsal", async () => {
    const lineup = await founder.caller.squads.lineup({ squadId });
    expect(lineup.formation).toBeNull();

    // `null` n'est pas « pas de formation » : c'est le défaut, et les places
    // du losange restent acceptées sans que rien n'ait été dit.
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [
        { slot: "GB", playerId: founder.identity.playerId },
        { slot: "MIL1", playerId: member.identity.playerId },
      ],
    });

    expect(
      (await founder.caller.squads.lineup({ squadId })).assignments,
    ).toHaveLength(2);
  });

  it("CLUB-003 — un club passe en carré et aligne deux défenseurs", async () => {
    // Le 1-2-2 a deux `DEF` et aucun milieu : c'est exactement ce que le
    // losange ne savait pas dessiner.
    await founder.caller.squads.setLineup({
      squadId,
      formation: "1-2-2",
      assignments: [
        { slot: "DEF1", playerId: founder.identity.playerId },
        { slot: "DEF2", playerId: member.identity.playerId },
      ],
    });

    const lineup = await founder.caller.squads.lineup({ squadId });
    expect(lineup.formation).toBe("1-2-2");
    expect(lineup.assignments.map((row) => row.slot)).toEqual(["DEF1", "DEF2"]);
  });

  it("CLUB-003 — une place que la forme ne dessine pas est refusée", async () => {
    await expect(
      founder.caller.squads.setLineup({
        squadId,
        formation: "1-2-2",
        assignments: [{ slot: "MIL1", playerId: founder.identity.playerId }],
      }),
    ).rejects.toThrow(/n'existe pas dans cette formation/i);
  });

  it("CLUB-003 — une forme inconnue à cinq est refusée", async () => {
    await expect(
      founder.caller.squads.setLineup({
        squadId,
        formation: "1-4-4-2",
        assignments: [],
      }),
    ).rejects.toThrow(/n'existe pas à cinq/i);
  });

  it("CLUB-003 — la forme reste quand on recompose sans la nommer", async () => {
    await founder.caller.squads.setLineup({
      squadId,
      formation: "1-3-1",
      assignments: [{ slot: "MIL3", playerId: founder.identity.playerId }],
    });

    // Une modification qui ne parle pas de forme garde la sienne : l'écran
    // n'a pas à la répéter pour déplacer une carte.
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [{ slot: "MIL2", playerId: member.identity.playerId }],
    });

    const lineup = await founder.caller.squads.lineup({ squadId });
    expect(lineup.formation).toBe("1-3-1");
    expect(lineup.assignments.map((row) => row.slot)).toEqual(["MIL2"]);
  });

  it("CLUB-003 — effacer la composition ne défait pas la forme", async () => {
    // La forme est une décision de jeu, la composition une liste de noms :
    // repartir des chiffres ne veut pas dire revenir au losange.
    await founder.caller.squads.setLineup({
      squadId,
      formation: "1-4",
      assignments: [{ slot: "MIL1", playerId: founder.identity.playerId }],
    });
    await founder.caller.squads.clearLineup({ squadId });

    const lineup = await founder.caller.squads.lineup({ squadId });
    expect(lineup.formation).toBe("1-4");
    expect(lineup.assignments).toEqual([]);
  });

  it("CLUB-003 — les places sortent dans l'ordre du terrain de leur forme", async () => {
    await founder.caller.squads.setLineup({
      squadId,
      formation: "1-3-1",
      assignments: [
        { slot: "ATT1", playerId: founder.identity.playerId },
        { slot: "MIL2", playerId: member.identity.playerId },
      ],
    });

    // Du but à la pointe : l'écran n'a pas à reconstruire l'ordre, et le
    // milieu passe avant la pointe.
    expect(
      (await founder.caller.squads.lineup({ squadId })).assignments.map(
        (row) => row.slot,
      ),
    ).toEqual(["MIL2", "ATT1"]);
  });
});
