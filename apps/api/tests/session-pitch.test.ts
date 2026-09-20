import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getGameMode } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Le terrain d'une session, en UNO League et en amical (MODE-004).
 *
 * Deux promesses opposées, et c'est le sujet. En **UNO League**, on ne
 * choisit ni ses coéquipiers ni son camp : les trois équipes sont tirées, et
 * c'est ce qui donne sa valeur au classement. Seul le poste se choisit, une
 * fois l'équipe connue. En **amical**, rien n'est en jeu : on choisit son
 * camp, et la feuille de match suit ce choix plutôt qu'un tirage.
 *
 * Entre les deux, le banc : un remplaçant entre dans la réservation sans
 * équipe, et son règlement lui donne la place d'un joueur qui n'a pas payé.
 */

const league = getGameMode("league")!;
const friendly = getGameMode("friendly")!;

/** Monte une réservation UNO League complète, personne n'ayant encore payé. */
async function leagueReservation(): Promise<{
  admin: TestPlayer;
  squad: TestPlayer[];
  proposalId: number;
}> {
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

  return { admin, squad, proposalId: proposal.id };
}

describe("le terrain d'une session UNO League (MODE-004)", () => {
  beforeEach(resetDatabase);

  it("MODE-004 — le plateau complet forme les trois équipes, sans rien demander", async () => {
    const { squad, proposalId } = await leagueReservation();

    /*
     * Personne n'a payé : c'est le point. Les équipes se forment à la
     * réservation, et ce sont elles qui ouvrent les vingt-quatre heures
     * pendant lesquelles chacun choisit sa place.
     */
    const teams = await squad[0]!.caller.proposals.teams({ proposalId });

    expect(teams).toHaveLength(3);
    for (const team of teams) expect(team.players).toHaveLength(5);

    const ids = teams.flatMap((team) => team.players.map((p) => p.id));
    expect(new Set(ids).size).toBe(league.minParticipants);
  });

  it("MODE-004 — chacun choisit son poste dans son équipe, payé ou non", async () => {
    const { squad, proposalId } = await leagueReservation();
    const moi = squad[3]!;

    await moi.caller.proposals.choosePitchSlot({ proposalId, slot: "GB" });

    const teams = await moi.caller.proposals.teams({ proposalId });
    const mienne = teams.find((team) =>
      team.players.some((p) => p.id === moi.identity.playerId),
    )!;
    expect(
      mienne.slots.find((slot) => slot.playerId === moi.identity.playerId)
        ?.pitchSlot,
    ).toBe("GB");
  });

  it("MODE-004 — une place prise dans son équipe est refusée, libre dans les autres", async () => {
    const { squad, proposalId } = await leagueReservation();
    const teams = await squad[0]!.caller.proposals.teams({ proposalId });

    const premiere = teams[0]!;
    const seconde = teams[1]!;
    const trouver = (playerId: number) =>
      squad.find((p) => p.identity.playerId === playerId)!;

    const gardien = trouver(premiere.players[0]!.id);
    const voisin = trouver(premiere.players[1]!.id);
    const adverse = trouver(seconde.players[0]!.id);

    await gardien.caller.proposals.choosePitchSlot({ proposalId, slot: "GB" });

    await expect(
      voisin.caller.proposals.choosePitchSlot({ proposalId, slot: "GB" }),
    ).rejects.toThrow(/déjà prise/i);

    // La même place, dans une autre équipe, n'a rien à voir.
    await adverse.caller.proposals.choosePitchSlot({ proposalId, slot: "GB" });
  });

  it("MODE-004 — le terrain est celui du futsal : cinq places, pas onze", async () => {
    const { squad, proposalId } = await leagueReservation();

    await expect(
      squad[0]!.caller.proposals.choosePitchSlot({ proposalId, slot: "DEF4" }),
    ).rejects.toThrow(/formation à 5/i);

    // Les cinq places du futsal, elles, sont acceptées.
    for (const [index, slot] of ["GB", "DEF1", "MIL1", "MIL2", "ATT1"].entries()) {
      const teams = await squad[0]!.caller.proposals.teams({ proposalId });
      const premiere = teams[0]!;
      const joueur = squad.find(
        (p) => p.identity.playerId === premiere.players[index]!.id,
      )!;
      await joueur.caller.proposals.choosePitchSlot({ proposalId, slot });
    }
  });

  it("MODE-004 — on libère sa place sans quitter son équipe", async () => {
    const { squad, proposalId } = await leagueReservation();
    const moi = squad[2]!;

    await moi.caller.proposals.choosePitchSlot({ proposalId, slot: "ATT1" });
    await moi.caller.proposals.choosePitchSlot({ proposalId, slot: null });

    const teams = await moi.caller.proposals.teams({ proposalId });
    const mienne = teams.find((team) =>
      team.players.some((p) => p.id === moi.identity.playerId),
    )!;
    expect(
      mienne.slots.some((slot) => slot.playerId === moi.identity.playerId),
    ).toBe(false);
    // Il reste bien dans son équipe : libérer sa place n'est pas partir.
    expect(mienne.players.map((p) => p.id)).toContain(moi.identity.playerId);
  });

  it("MODE-004 — le tirage ne se refait pas quand quelqu'un paie", async () => {
    const { squad, proposalId } = await leagueReservation();

    const avant = await squad[0]!.caller.proposals.teams({ proposalId });

    for (const player of squad) {
      await player.caller.proposals.pay({
        proposalId,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }

    const apres = await squad[0]!.caller.proposals.teams({ proposalId });
    expect(apres.map((team) => team.players.map((p) => p.id))).toEqual(
      avant.map((team) => team.players.map((p) => p.id)),
    );
  });

  it("MODE-004 — un remplaçant qui paie prend la place d'un impayé", async () => {
    const { admin, squad, proposalId } = await leagueReservation();

    /*
     * Treize règlent, deux traînent. Treize et non quatorze : le paiement du
     * remplaçant porterait alors le quota à quinze, la séance se confirmerait
     * et les impayés seraient retirés de la séance entière, pas seulement du
     * terrain. Ce test-ci porte sur le banc, qui n'existe que pendant la
     * réservation.
     */
    for (const player of squad.slice(0, 13)) {
      await player.caller.proposals.pay({
        proposalId,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }
    // Le dernier inscrit parmi les impayés : c'est lui qui cède sa place.
    const traine = squad[14]!;

    const remplacant = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: remplacant.identity.playerId,
      division: "D1",
    });
    await grantUno(remplacant.identity.playerId, 1000);

    await remplacant.caller.proposals.becomeSubstitute({ proposalId });
    // L'échéance tombe : la file des remplaçants s'ouvre.
    await db.execute(
      sql`UPDATE proposals SET payment_deadline = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ${proposalId}`,
    );
    await remplacant.caller.proposals.claimSeat({
      proposalId,
      idempotencyKey: randomUUID(),
    });

    const teams = await admin.caller.proposals.teams({ proposalId });
    const surLeTerrain = teams.flatMap((team) => team.players.map((p) => p.id));

    expect(surLeTerrain).toContain(remplacant.identity.playerId);
    // Le joueur délogé reste inscrit : il passe sur le banc, pas dehors.
    expect(surLeTerrain).not.toContain(traine.identity.playerId);

    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.participants.map((row) => row.player.id)).toContain(
      traine.identity.playerId,
    );
  });

  it("MODE-004 — sur le banc, il n'y a pas de place à choisir", async () => {
    const { admin, squad, proposalId } = await leagueReservation();

    for (const player of squad.slice(0, 14)) {
      await player.caller.proposals.pay({
        proposalId,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }

    const remplacant = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: remplacant.identity.playerId,
      division: "D1",
    });
    await grantUno(remplacant.identity.playerId, 1000);
    await remplacant.caller.proposals.becomeSubstitute({ proposalId });
    // L'échéance tombe : la file des remplaçants s'ouvre.
    await db.execute(
      sql`UPDATE proposals SET payment_deadline = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ${proposalId}`,
    );

    // Admis dans la réservation mais pas encore payé : aucune équipe.
    await expect(
      remplacant.caller.proposals.choosePitchSlot({ proposalId, slot: "GB" }),
    ).rejects.toThrow();
  });
});

describe("le terrain d'un amical (MODE-004)", () => {
  beforeEach(resetDatabase);

  /** Monte un amical complet : dix joueurs, chacun ayant choisi son camp. */
  async function friendlySession() {
    const squad: TestPlayer[] = [];
    for (let i = 0; i < friendly.minParticipants; i++) {
      const player = await createPlayer();
      await grantUno(player.identity.playerId, 1000);
      squad.push(player);
    }

    const { proposal } = await squad[0]!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 19,
      venueId: "arena",
      modeId: "friendly",
    });

    // Cinq d'un côté, cinq de l'autre, choisis et non tirés.
    for (const [index, player] of squad.slice(1).entries()) {
      await player.caller.proposals.join({
        proposalId: proposal.id,
        side: index < 4 ? "A" : "B",
      });
    }

    return { squad, proposalId: proposal.id };
  }

  it("MODE-004 — on choisit son camp en amical, comme en Grand Foot", async () => {
    const { squad, proposalId } = await friendlySession();

    const detail = await squad[0]!.caller.proposals.get({ proposalId });
    const camps = detail.participants.map((row) => row.side);
    expect(camps.filter((side) => side === "A")).toHaveLength(5);
    expect(camps.filter((side) => side === "B")).toHaveLength(5);
  });

  it("MODE-004 — la feuille de match suit les camps choisis, sans les redistribuer", async () => {
    const { squad, proposalId } = await friendlySession();

    const detail = await squad[0]!.caller.proposals.get({ proposalId });
    const campA = detail.participants
      .filter((row) => row.side === "A")
      .map((row) => row.player.id)
      .sort((a, b) => a - b);

    const teams = await squad[0]!.caller.proposals.teams({ proposalId });
    expect(teams).toHaveLength(2);
    expect(teams[0]!.players.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      campA,
    );
  });

  it("MODE-004 — le terrain d'un amical a les cinq places du futsal", async () => {
    const { squad, proposalId } = await friendlySession();

    await squad[0]!.caller.proposals.choosePitchSlot({ proposalId, slot: "GB" });
    await expect(
      squad[1]!.caller.proposals.choosePitchSlot({ proposalId, slot: "MIL3" }),
    ).rejects.toThrow(/formation à 5/i);

    const detail = await squad[0]!.caller.proposals.get({ proposalId });
    expect(
      detail.participants.find(
        (row) => row.player.id === squad[0]!.identity.playerId,
      )?.pitchSlot,
    ).toBe("GB");
  });
});
