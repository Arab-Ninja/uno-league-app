import { beforeEach, describe, expect, it } from "vitest";
import {
  createFundedPlayer as createPlayer,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * La composition du terrain (CLUB-002).
 *
 * Le terrain n'affichait qu'une déduction statistique : le meilleur buteur à
 * la pointe, le meilleur passeur sur une aile. Ces tests portent sur ce que
 * le club décide lui-même, et surtout sur ce qu'il ne peut pas décider — un
 * joueur à deux postes, l'effectif d'en face, ou une composition posée par
 * quelqu'un qui n'a pas la main.
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

describe("composition du terrain (CLUB-002)", () => {
  let founder: TestPlayer;
  let captain: TestPlayer;
  let member: TestPlayer;
  let squadId: number;

  beforeEach(async () => {
    await resetDatabase();

    founder = await createPlayer();
    captain = await createPlayer();
    member = await createPlayer();

    squadId = await found(founder, "Les Loups");
    await join(captain, founder, squadId);
    await join(member, founder, squadId);

    await founder.caller.squads.setMemberRole({
      squadId,
      playerId: captain.identity.playerId,
      role: "captain",
    });
  });

  it("CLUB-002 — sans composition enregistrée, le terrain n'en renvoie aucune", async () => {
    // L'absence est un état normal : le club qui ne s'en occupe pas garde le
    // cinq statistique, et n'a rien à faire pour cela.
    expect(
      (await founder.caller.squads.lineup({ squadId })).assignments,
    ).toEqual([]);
  });

  it("CLUB-002 — le fondateur pose son cinq, et il revient dans l'ordre du terrain", async () => {
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [
        { slot: "ATT1", playerId: member.identity.playerId },
        { slot: "GB", playerId: founder.identity.playerId },
        { slot: "MIL1", playerId: captain.identity.playerId },
      ],
    });

    const { assignments: lineup } = await founder.caller.squads.lineup({
      squadId,
    });

    // Rendu du but vers la pointe, quel que soit l'ordre d'envoi : l'écran
    // n'a pas à reclasser ce que le serveur sait déjà ranger.
    expect(lineup.map((row) => row.slot)).toEqual(["GB", "MIL1", "ATT1"]);
    expect(lineup[0]!.playerId).toBe(founder.identity.playerId);
    expect(lineup[2]!.playerId).toBe(member.identity.playerId);
  });

  it("CLUB-002 — un capitaine compose aussi ; un membre ordinaire, non", async () => {
    await captain.caller.squads.setLineup({
      squadId,
      assignments: [{ slot: "ATT1", playerId: captain.identity.playerId }],
    });
    expect(
      (await founder.caller.squads.lineup({ squadId })).assignments,
    ).toHaveLength(1);

    await expect(
      member.caller.squads.setLineup({
        squadId,
        assignments: [{ slot: "GB", playerId: member.identity.playerId }],
      }),
    ).rejects.toThrow(/fondateur et aux capitaines/i);
  });

  it("CLUB-002 — un joueur n'occupe qu'un emplacement", async () => {
    await expect(
      founder.caller.squads.setLineup({
        squadId,
        assignments: [
          { slot: "ATT1", playerId: member.identity.playerId },
          { slot: "MIL1", playerId: member.identity.playerId },
        ],
      }),
    ).rejects.toThrow(/qu'un emplacement/i);
  });

  it("CLUB-002 — on ne compose pas avec l'effectif d'en face", async () => {
    /*
     * La clé étrangère ne porte que sur l'existence du joueur : sans
     * vérification d'appartenance, un fondateur alignait le meilleur buteur du
     * club adverse sur son propre terrain.
     */
    const etranger = await createPlayer();
    await found(etranger, "Les Faucons");

    await expect(
      founder.caller.squads.setLineup({
        squadId,
        assignments: [{ slot: "ATT1", playerId: etranger.identity.playerId }],
      }),
    ).rejects.toThrow(/ne fait pas partie de l'effectif/i);
  });

  it("CLUB-002 — enregistrer remplace, sans laisser de traces de l'ancienne", async () => {
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [
        { slot: "ATT1", playerId: member.identity.playerId },
        { slot: "GB", playerId: founder.identity.playerId },
      ],
    });

    // Le même joueur change d'emplacement : impossible par retouches — les
    // deux lignes se seraient heurtées à l'unicité — trivial par remplacement.
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [
        { slot: "GB", playerId: member.identity.playerId },
        { slot: "ATT1", playerId: founder.identity.playerId },
      ],
    });

    const { assignments: lineup } = await founder.caller.squads.lineup({
      squadId,
    });
    expect(lineup).toHaveLength(2);
    expect(lineup.find((r) => r.slot === "GB")?.playerId).toBe(
      member.identity.playerId,
    );
    expect(lineup.find((r) => r.slot === "ATT1")?.playerId).toBe(
      founder.identity.playerId,
    );
  });

  it("CLUB-002 — effacer la composition rend la main aux statistiques", async () => {
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [{ slot: "ATT1", playerId: member.identity.playerId }],
    });

    await founder.caller.squads.clearLineup({ squadId });
    expect(
      (await founder.caller.squads.lineup({ squadId })).assignments,
    ).toEqual([]);
  });

  it("CLUB-002 — un joueur parti disparaît du terrain sans l'effacer", async () => {
    /*
     * Un joueur quitte son club sans que la composition en sache rien. Le
     * terrain afficherait quelqu'un qui n'est plus là — et pire, les défis
     * l'aligneraient.
     *
     * La ligne n'est pas effacée pour autant : une lecture ne doit rien
     * écrire, et le joueur peut revenir.
     */
    await founder.caller.squads.setLineup({
      squadId,
      assignments: [
        { slot: "ATT1", playerId: member.identity.playerId },
        { slot: "GB", playerId: founder.identity.playerId },
      ],
    });

    await member.caller.squads.leave();

    const { assignments: lineup } = await founder.caller.squads.lineup({
      squadId,
    });
    expect(lineup).toHaveLength(1);
    expect(lineup[0]!.playerId).toBe(founder.identity.playerId);
  });
});
