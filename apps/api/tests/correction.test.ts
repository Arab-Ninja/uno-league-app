import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getGameMode } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  balanceOf,
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  reloadIdentity,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Correction d'une session déjà clôturée (MATCH-007).
 *
 * Une clôture distribue tout d'un coup : statistiques de carrière, XP,
 * niveau, homme du match, distinctions, montées et descentes, note de carte.
 * Corriger un chiffre saisi de travers suppose donc de **défaire** tout cela
 * avant de le rejouer — c'est ce que ces tests vérifient, dans les deux sens.
 */

const league = getGameMode("league")!;

interface PlayedSession {
  admin: TestPlayer;
  squad: TestPlayer[];
  proposalId: number;
  matchId: number;
  lineup: number[];
}

/** État complet d'un joueur, pour comparer un avant et un après. */
async function snapshot(playerId: number): Promise<{
  goals: number;
  assists: number;
  xp: number;
  level: number;
  motm: number;
  matchesPlayed: number;
  rating: number;
  division: string;
}> {
  const rows = await db.execute(
    sql`SELECT goals, assists, xp, level, motm, matches_played AS matchesPlayed,
               rating, division
        FROM players WHERE id = ${playerId}`,
  );
  const row = (rows[0] as unknown as Record<string, unknown>[])[0]!;
  return {
    goals: Number(row["goals"]),
    assists: Number(row["assists"]),
    xp: Number(row["xp"]),
    level: Number(row["level"]),
    motm: Number(row["motm"]),
    matchesPlayed: Number(row["matchesPlayed"]),
    rating: Number(row["rating"]),
    division: String(row["division"]),
  };
}

/** Session League complète, un match joué, prête à être saisie. */
async function playedSession(): Promise<PlayedSession> {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];

  for (let index = 0; index < league.minParticipants; index++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D2",
    });
    await grantUno(player.identity.playerId, 5000);
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
  for (const player of squad) {
    await player.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: randomUUID(),
    });
  }

  const teams = await admin.caller.supervision.generateTeams({
    proposalId: proposal.id,
  });
  await admin.caller.supervision.addMatch({
    proposalId: proposal.id,
    teamAId: teams[0]!.id,
    teamBId: teams[1]!.id,
  });

  const matches = await admin.caller.proposals.matches({
    proposalId: proposal.id,
  });
  const match = matches[0]!;
  const lineup = [
    ...(match.teamA?.players ?? []),
    ...(match.teamB?.players ?? []),
  ].map((player) => player.id);

  return { admin, squad, proposalId: proposal.id, matchId: match.id, lineup };
}

/** Saisit le match en donnant `goals` buts au premier de la composition. */
async function record(
  session: PlayedSession,
  goals: number,
  by: TestPlayer = session.admin,
): Promise<void> {
  await by.caller.supervision.record({
    proposalId: session.proposalId,
    matches: [
      {
        matchId: session.matchId,
        scoreA: goals,
        scoreB: 0,
        stats: session.lineup.map((playerId, index) => ({
          playerId,
          goals: index === 0 ? goals : 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      },
    ],
    complete: true,
  });
}

describe("correction d'une session clôturée (MATCH-007)", () => {
  beforeEach(resetDatabase);

  it("MATCH-007 — rouvrir défait exactement ce que la clôture avait fait", async () => {
    const session = await playedSession();
    const heroId = session.lineup[0]!;

    const before = await snapshot(heroId);
    await record(session, 7);

    const closed = await snapshot(heroId);
    expect(closed.goals).toBe(before.goals + 7);
    expect(closed.xp).toBeGreaterThan(before.xp);
    expect(closed.matchesPlayed).toBe(before.matchesPlayed + 1);
    expect(closed.motm).toBe(before.motm + 1);
    // Premier de la session : il monte en D1.
    expect(closed.division).toBe("D1");

    await session.admin.caller.supervision.reopen({
      proposalId: session.proposalId,
    });

    const reopened = await snapshot(heroId);
    expect(reopened.goals).toBe(before.goals);
    expect(reopened.xp).toBe(before.xp);
    expect(reopened.level).toBe(before.level);
    expect(reopened.motm).toBe(before.motm);
    expect(reopened.matchesPlayed).toBe(before.matchesPlayed);
    expect(reopened.rating).toBe(before.rating);
    expect(reopened.division).toBe(before.division);

    // La session est de nouveau saisissable, et son classement effacé.
    const detail = await session.admin.caller.proposals.get({
      proposalId: session.proposalId,
    });
    expect(detail.status).toBe("session");
    expect(detail.participants.every((row) => row.sessionRank === null)).toBe(true);
    expect(detail.participants.every((row) => row.movement === null)).toBe(true);
  });

  it("MATCH-007 — la correction remplace les chiffres, sans les cumuler", async () => {
    const session = await playedSession();
    const heroId = session.lineup[0]!;
    const before = await snapshot(heroId);

    // Saisie fautive : neuf buts au lieu de trois.
    await record(session, 9);
    expect((await snapshot(heroId)).goals).toBe(before.goals + 9);

    await session.admin.caller.supervision.reopen({
      proposalId: session.proposalId,
    });
    await record(session, 3);

    // Trois, et non douze : c'est tout l'objet de la réouverture.
    const corrected = await snapshot(heroId);
    expect(corrected.goals).toBe(before.goals + 3);
    expect(corrected.matchesPlayed).toBe(before.matchesPlayed + 1);
    expect(corrected.motm).toBe(before.motm + 1);
  });

  it("MATCH-007 — les UNO déjà versés ne sont pas repris", async () => {
    const session = await playedSession();
    const heroId = session.lineup[0]!;

    await record(session, 6);
    const rewarded = await balanceOf(heroId);

    await session.admin.caller.supervision.reopen({
      proposalId: session.proposalId,
    });

    // Une récompense remise n'est pas reprise : reprendre des UNO déjà
    // dépensés en boutique creuserait un solde négatif.
    expect(await balanceOf(heroId)).toBe(rewarded);

    // Et la re-clôture ne les verse pas une seconde fois.
    await record(session, 6);
    expect(await balanceOf(heroId)).toBe(rewarded);
  });

  it("MATCH-007 — une session jamais clôturée ne se rouvre pas", async () => {
    const session = await playedSession();

    await expect(
      session.admin.caller.supervision.reopen({
        proposalId: session.proposalId,
      }),
    ).rejects.toThrow(/clôturée/i);
  });

  it("MATCH-007 — la réouverture est réservée à l'administration", async () => {
    const session = await playedSession();
    await record(session, 5);

    // Même nommé superviseur, un joueur ne rouvre pas une session : rouvrir
    // défait des distinctions, des UNO et des montées de division (SUP-003).
    await session.admin.caller.admin.setSupervisor({
      playerId: session.squad[0]!.identity.playerId,
      isSupervisor: true,
    });
    const supervisor = await reloadIdentity(session.squad[0]!);

    await expect(
      supervisor.caller.supervision.reopen({ proposalId: session.proposalId }),
    ).rejects.toThrow(/droits nécessaires/i);

    await expect(
      session.squad[1]!.caller.supervision.reopen({
        proposalId: session.proposalId,
      }),
    ).rejects.toThrow(/droits nécessaires/i);
  });
});
