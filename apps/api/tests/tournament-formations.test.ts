import { beforeEach, describe, expect, it } from "vitest";
import {
  createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * La forme du terrain sur une feuille de tournoi (CLUB-003).
 *
 * Une feuille de tournoi se prépare pour un adversaire : un club peut vouloir
 * y aligner autre chose que sa forme habituelle, sans changer son terrain de
 * club pour autant. Ces tests portent sur cette indépendance — et sur ce
 * qu'elle ne défait pas : reprendre le cinq type du club reprend la forme
 * avec, sinon les cartes tomberaient n'importe où.
 */

interface Club {
  founder: TestPlayer;
  member: TestPlayer;
  squadId: number;
}

async function club(name: string): Promise<Club> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const member = await createPlayer();
  await member.caller.squads.requestToJoin({ squadId: squad.id });
  const detail = await founder.caller.squads.detail({ squadId: squad.id });
  await founder.caller.squads.decideRequest({
    requestId: detail.pendingRequests[0]!.id,
    accept: true,
  });

  return { founder, member, squadId: squad.id };
}

/** Un tournoi ouvert, un club engagé, et l'engagement de ce club. */
async function engaged() {
  const admin = await promoteToAdmin(await createPlayer());
  const tournament = await admin.caller.tournaments.create({
    name: "Coupe des formes",
    date: daysFromNow(9),
    slotStartHour: 18,
    venueId: "arena",
    size: 4,
    entryFeeUno: 0,
    prizeUno: 0,
  });

  const one = await club("Les Loups");
  await one.founder.caller.tournaments.register({
    tournamentId: tournament.id,
  });

  const detail = await one.founder.caller.tournaments.get({
    tournamentId: tournament.id,
  });
  const entryId = detail.entries.find(
    (entry) => entry.squad.id === one.squadId,
  )!.id;

  return { admin, tournament, one, entryId };
}

describe("la forme d'une feuille de tournoi (CLUB-003)", () => {
  beforeEach(resetDatabase);

  it("CLUB-003 — sans rien préciser, l'engagement joue la forme du club", async () => {
    const { one, entryId } = await engaged();

    await one.founder.caller.squads.setLineup({
      squadId: one.squadId,
      formation: "1-3-1",
      assignments: [],
    });

    const feuille = await one.founder.caller.tournaments.entryLineup({
      entryId,
    });
    expect(feuille.formation).toBe("1-3-1");

    // Et les places de cette forme sont acceptées sans l'avoir répétée.
    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      assignments: [{ slot: "MIL3", playerId: one.founder.identity.playerId }],
    });
  });

  it("CLUB-003 — une feuille peut jouer autre chose que le club", async () => {
    const { one, entryId } = await engaged();

    await one.founder.caller.squads.setLineup({
      squadId: one.squadId,
      formation: "1-3-1",
      assignments: [],
    });

    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      formation: "1-2-2",
      assignments: [{ slot: "DEF2", playerId: one.founder.identity.playerId }],
    });

    expect(
      (await one.founder.caller.tournaments.entryLineup({ entryId })).formation,
    ).toBe("1-2-2");
    // Le terrain du club n'a pas bougé : préparer un match n'est pas changer
    // sa façon de jouer.
    expect(
      (await one.founder.caller.squads.lineup({ squadId: one.squadId }))
        .formation,
    ).toBe("1-3-1");
  });

  it("CLUB-003 — une place absente de la forme de la feuille est refusée", async () => {
    const { one, entryId } = await engaged();

    await expect(
      one.founder.caller.tournaments.setEntryLineup({
        entryId,
        formation: "1-2-2",
        assignments: [
          { slot: "MIL1", playerId: one.founder.identity.playerId },
        ],
      }),
    ).rejects.toThrow(/n'existe pas dans cette formation/i);
  });

  it("CLUB-003 — le raccourci reprend le cinq type avec sa forme", async () => {
    const { one, entryId } = await engaged();

    await one.founder.caller.squads.setLineup({
      squadId: one.squadId,
      formation: "1-2-2",
      assignments: [
        { slot: "DEF1", playerId: one.founder.identity.playerId },
        { slot: "DEF2", playerId: one.member.identity.playerId },
      ],
    });

    // La feuille jouait autre chose : le raccourci doit la ramener à la forme
    // du club, sans quoi ses deux défenseurs n'auraient nulle part où aller.
    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      formation: "1-3-1",
      assignments: [],
    });

    await one.founder.caller.tournaments.fillEntryFromSquadLineup({ entryId });

    const feuille = await one.founder.caller.tournaments.entryLineup({
      entryId,
    });
    expect(feuille.formation).toBe("1-2-2");
    expect(feuille.assignments.map((row) => row.slot)).toEqual([
      "DEF1",
      "DEF2",
    ]);
  });

  it("CLUB-003 — chaque feuille du tournoi porte la sienne", async () => {
    const { tournament, one, entryId } = await engaged();

    const other = await club("Les Aigles");
    await other.founder.caller.tournaments.register({
      tournamentId: tournament.id,
    });
    const detail = await other.founder.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    const otherEntry = detail.entries.find(
      (entry) => entry.squad.id === other.squadId,
    )!.id;

    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      formation: "1-4",
      assignments: [{ slot: "MIL4", playerId: one.founder.identity.playerId }],
    });
    await other.founder.caller.tournaments.setEntryLineup({
      entryId: otherEntry,
      formation: "1-2-2",
      assignments: [
        { slot: "ATT2", playerId: other.founder.identity.playerId },
      ],
    });

    const feuilles = await one.founder.caller.tournaments.lineups({
      tournamentId: tournament.id,
    });

    expect(feuilles.find((row) => row.entryId === entryId)?.formation).toBe(
      "1-4",
    );
    expect(feuilles.find((row) => row.entryId === otherEntry)?.formation).toBe(
      "1-2-2",
    );
  });
});
