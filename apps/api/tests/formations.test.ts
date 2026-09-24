import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getGameMode } from "@uno/shared";
import { db } from "../src/db/client.js";
import { proposalParticipants } from "../src/db/schema.js";
import {
  createFundedPlayer as createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * La forme du terrain se choisit (PITCH-001).
 *
 * Un 1-2-2 ne se joue pas comme un 1-3-1, et imposer la même forme à tout le
 * monde revenait à choisir la tactique à la place des joueurs.
 *
 * **Ce qui se vérifie ici tient en une règle** : changer de forme ne doit
 * jamais laisser en base une place que le terrain ne dessine plus. Un 1-2-2
 * n'a pas de `MIL1` ; le joueur qui l'occupait doit repartir sans place. Sans
 * cela, la base porterait une place fantôme — invisible à l'écran, refusée au
 * prochain geste, et introuvable pour qui cherche la panne.
 *
 * Le reste garde les portes fermées : une forme d'un autre effectif, une
 * séance jouée, un joueur sans camp.
 */

const league = getGameMode("league")!;

/** Ouvre une séance de Football et y range deux joueurs, un par camp. */
async function grandFoot(playersPerTeam: number): Promise<{
  hoteA: TestPlayer;
  joueurB: TestPlayer;
  proposalId: number;
}> {
  const hoteA = await createPlayer();
  const { proposal } = await hoteA.caller.proposals.create({
    date: daysFromNow(3),
    slotStartHour: 18,
    venueId: "londerzeel",
    modeId: "bigfoot",
    playersPerTeam,
  });

  await hoteA.caller.proposals.chooseSide({
    proposalId: proposal.id,
    side: "A",
  });

  const joueurB = await createPlayer();
  await joueurB.caller.proposals.join({ proposalId: proposal.id, side: "B" });

  return { hoteA, joueurB, proposalId: proposal.id };
}

/** Monte une réservation UNO League complète : les trois équipes existent. */
async function ligue(): Promise<{ squad: TestPlayer[]; proposalId: number }> {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];

  for (let i = 0; i < league.minParticipants; i++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });
    await grantUno(player.identity.playerId, 1000);
    squad.push(player);
  }

  const { proposal } = await squad[0]!.caller.proposals.create({
    date: daysFromNow(3),
    slotStartHour: 18,
    venueId: "arena",
    modeId: "league",
  });
  for (const player of squad.slice(1)) {
    await player.caller.proposals.join({ proposalId: proposal.id });
  }

  return { squad, proposalId: proposal.id };
}

async function slotOf(proposalId: number, playerId: number) {
  const rows = await db
    .select({
      playerId: proposalParticipants.playerId,
      pitchSlot: proposalParticipants.pitchSlot,
    })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));
  return rows.find((row) => row.playerId === playerId)?.pitchSlot ?? null;
}

describe("changer la forme du terrain (PITCH-001)", () => {
  beforeEach(resetDatabase);

  it("PITCH-001 — la forme d'un camp se choisit, et l'autre camp n'y est pour rien", async () => {
    const { hoteA, joueurB, proposalId } = await grandFoot(7);

    await hoteA.caller.proposals.setFormation({
      proposalId,
      formation: "1-3-1-2",
    });

    const vue = await hoteA.caller.proposals.get({ proposalId });
    expect(vue.formations.A).toBe("1-3-1-2");
    // Le camp d'en face garde la sienne : deux équipes, deux tactiques.
    expect(vue.formations.B).toBeNull();

    await joueurB.caller.proposals.setFormation({
      proposalId,
      formation: "1-2-3-1",
    });
    const apres = await hoteA.caller.proposals.get({ proposalId });
    expect(apres.formations.A).toBe("1-3-1-2");
    expect(apres.formations.B).toBe("1-2-3-1");
  });

  it("PITCH-001 — changer de forme déloge celui dont la place n'existe plus", async () => {
    const { hoteA, proposalId } = await grandFoot(7);

    // 1-3-2-1, la forme par défaut à sept : MIL2 existe.
    await hoteA.caller.proposals.choosePitchSlot({
      proposalId,
      slot: "MIL2",
    });
    expect(await slotOf(proposalId, hoteA.identity.playerId)).toBe("MIL2");

    // 1-3-1-2 n'a qu'un milieu : la place disparaît, et le joueur avec elle.
    await hoteA.caller.proposals.setFormation({
      proposalId,
      formation: "1-3-1-2",
    });
    expect(await slotOf(proposalId, hoteA.identity.playerId)).toBeNull();
  });

  it("PITCH-001 — celui dont la place existe encore ne bouge pas", async () => {
    const { hoteA, proposalId } = await grandFoot(7);

    // DEF2 existe en 1-3-2-1 comme en 1-3-1-2 : rien ne justifie de déloger.
    await hoteA.caller.proposals.choosePitchSlot({ proposalId, slot: "DEF2" });
    await hoteA.caller.proposals.setFormation({
      proposalId,
      formation: "1-3-1-2",
    });
    expect(await slotOf(proposalId, hoteA.identity.playerId)).toBe("DEF2");
  });

  it("PITCH-001 — une place absente de la forme retenue est refusée", async () => {
    const { hoteA, proposalId } = await grandFoot(7);

    await hoteA.caller.proposals.setFormation({
      proposalId,
      formation: "1-3-1-2",
    });

    await expect(
      hoteA.caller.proposals.choosePitchSlot({ proposalId, slot: "MIL2" }),
    ).rejects.toThrow(/n'existe pas/i);
  });

  it("PITCH-001 — une forme d'un autre effectif est refusée", async () => {
    const { hoteA, proposalId } = await grandFoot(7);

    // 1-4-4-2 est une forme à onze : elle n'a pas de sens à sept.
    await expect(
      hoteA.caller.proposals.setFormation({
        proposalId,
        formation: "1-4-4-2",
      }),
    ).rejects.toThrow(/n'existe pas à 7 joueurs/i);
  });

  it("PITCH-001 — un joueur sans camp ne pose aucune forme", async () => {
    const { proposalId } = await grandFoot(7);

    const spectateur = await createPlayer();
    await expect(
      spectateur.caller.proposals.setFormation({
        proposalId,
        formation: "1-2-3-1",
      }),
    ).rejects.toThrow();
  });

  it("PITCH-001 — en UNO League, la forme appartient à son équipe tirée", async () => {
    const { squad, proposalId } = await ligue();
    const moi = squad[4]!;

    await moi.caller.proposals.setFormation({ proposalId, formation: "1-2-2" });

    const teams = await moi.caller.proposals.teams({ proposalId });
    const mienne = teams.find((team) =>
      team.players.some((p) => p.id === moi.identity.playerId),
    )!;
    expect(mienne.formation).toBe("1-2-2");

    // Les deux autres équipes n'ont pas changé de terrain pour autant.
    for (const team of teams.filter((row) => row.id !== mienne.id)) {
      expect(team.formation).toBeNull();
    }
  });

  it("PITCH-001 — en UNO League aussi, le changement déloge", async () => {
    const { squad, proposalId } = await ligue();
    const moi = squad[2]!;

    // 1-1-2-1 par défaut à cinq : MIL1 existe, DEF2 non.
    await moi.caller.proposals.choosePitchSlot({ proposalId, slot: "MIL1" });

    await moi.caller.proposals.setFormation({ proposalId, formation: "1-2-2" });

    const teams = await moi.caller.proposals.teams({ proposalId });
    const mienne = teams.find((team) =>
      team.players.some((p) => p.id === moi.identity.playerId),
    )!;
    expect(
      mienne.slots.find((slot) => slot.playerId === moi.identity.playerId),
    ).toBeUndefined();

    // Et la place neuve est désormais ouverte.
    await moi.caller.proposals.choosePitchSlot({ proposalId, slot: "DEF2" });
  });
});
