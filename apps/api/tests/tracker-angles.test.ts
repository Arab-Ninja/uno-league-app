import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getGameMode } from "@uno/shared";
import { db } from "../src/db/client.js";
import { notificationDeliveries } from "../src/db/schema.js";
import {
  createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * La saisie en visionnage d'un terrain filmé par deux caméras (TRACK-001).
 *
 * Ce que ces tests protègent : les équipes portent le nom et la couleur des
 * chasubles réellement portées, et la feuille publiée laisse aux joueurs, à
 * côté du résultat, une vidéo dont chaque action relevée est un moment-clé —
 * dans les deux angles, le second décalé de son calage.
 */

const league = getGameMode("league")!;

async function sheetWithPlayers(): Promise<{
  admin: TestPlayer;
  squad: TestPlayer[];
  sessionId: number;
}> {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];
  for (let index = 0; index < league.minParticipants; index++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });
    squad.push(player);
  }
  const created = await admin.caller.tracker.create({
    label: "Match du vendredi",
    localDate: "2026-02-13",
    slotStartHour: 20,
    modeId: "league",
    division: "D1",
    venueId: "arena",
  });
  await admin.caller.tracker.draft({
    sessionId: created.session.id,
    playerIds: squad.map((player) => player.identity.playerId),
  });
  return { admin, squad, sessionId: created.session.id };
}

describe("équipes de la feuille (TRACK-001)", () => {
  beforeEach(resetDatabase);

  it("TRACK-001 — une équipe prend le nom et la couleur de ses chasubles", async () => {
    const { admin, sessionId, squad } = await sheetWithPlayers();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const team = sheet.teams[0]!;

    const renamed = await admin.caller.tracker.updateTeam({
      teamId: team.id,
      name: "  Noirs  ",
      color: "#111111",
    });
    expect(renamed.teams.find((item) => item.id === team.id)).toMatchObject({
      name: "Noirs",
      color: "#111111",
    });

    await expect(
      admin.caller.tracker.updateTeam({
        teamId: team.id,
        name: "Noirs",
        color: "noir",
      }),
    ).rejects.toThrow();
    // Un joueur ordinaire ne touche pas à la feuille.
    await expect(
      squad[0]!.caller.tracker.updateTeam({
        teamId: team.id,
        name: "Pirates",
        color: "#ff0000",
      }),
    ).rejects.toThrow();
  });
});

describe("moments-clés tirés de la feuille (TRACK-001, SUP-004)", () => {
  beforeEach(resetDatabase);

  it("TRACK-001 — chaque but relevé devient un moment-clé, dans les deux angles", async () => {
    const { admin, sessionId, squad } = await sheetWithPlayers();
    await admin.caller.tracker.addVideo({
      sessionId,
      label: "Angle 1",
      url: "https://videos.test/match/angle1.mp4",
    });
    const withVideos = await admin.caller.tracker.addVideo({
      sessionId,
      label: "Angle 2",
      url: "https://videos.test/match/angle2.mp4",
    });
    const [angle1, angle2] = withVideos.session.videos;
    const [teamA, teamB] = withVideos.teams;
    await admin.caller.tracker.updateTeam({
      teamId: teamA!.id,
      name: "Bleus",
      color: "#2563eb",
    });

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;
    // Le coup d'envoi posé à 1:00 de l'angle 1.
    await admin.caller.tracker.updateMatch({
      matchId: match.id,
      status: "playing",
      videoStartMs: 60_000,
      videoId: angle1!.id,
    });

    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;
    const passer = withMatch.participants.find(
      (p) => p.teamId === teamA!.id && p.id !== scorer.id,
    )!;
    const keeper = withMatch.participants.find((p) => p.teamId === teamB!.id)!;
    await admin.caller.tracker.sync({
      sessionId,
      upserts: [
        {
          clientId: randomUUID(),
          matchId: match.id,
          type: "goal",
          participantId: scorer.id,
          assistParticipantId: passer.id,
          teamId: teamA!.id,
          clockMs: 120_000,
          videoMs: 180_000,
        },
        {
          clientId: randomUUID(),
          matchId: match.id,
          type: "save",
          participantId: keeper.id,
          assistParticipantId: null,
          teamId: teamB!.id,
          clockMs: 240_000,
          videoMs: 300_000,
        },
      ],
      deletions: [],
    });
    await admin.caller.tracker.updateMatch({
      matchId: match.id,
      status: "finished",
    });

    // L'angle 2 a démarré plus tôt : le même geste y est 3,5 s plus loin.
    const published = await admin.caller.tracker.publish({
      sessionId,
      angles: {
        referenceId: angle1!.id,
        otherId: angle2!.id,
        offsetMs: 3_500,
      },
    });
    expect(published.videosOnline).toBe(true);

    const videos = await squad[0]!.caller.supervision.videos({
      proposalId: published.proposalId,
    });
    const first = videos.find((video) => video.label === "Angle 1")!;
    const second = videos.find((video) => video.label === "Angle 2")!;

    expect(first.moments.map((moment) => [moment.kind, moment.t])).toEqual([
      ["kickoff", 60],
      // Le but se revoit 8 s avant d'être marqué : on le voit naître.
      ["goal", 172],
      ["save", 296],
    ]);
    const goal = first.moments.find((moment) => moment.kind === "goal")!;
    expect(goal.label).toBe(`But de ${scorer.displayName}`);
    expect(goal.detail).toBe(`Bleus · 1-0 · passe de ${passer.displayName}`);
    expect(goal.minute).toBe(2);

    expect(second.moments.map((moment) => moment.t)).toEqual([
      63.5, 175.5, 299.5,
    ]);

    // Les joueurs sont prévenus que la vidéo de leur match est en ligne.
    const notified = await db
      .select({ playerId: notificationDeliveries.playerId })
      .from(notificationDeliveries)
      .where(
        sql`event_key = ${`proposal:${published.proposalId}:video-online`} AND channel = 'inapp'`,
      );
    expect(notified.length).toBeGreaterThan(0);
  });
});

describe("invités d'un match amical (TRACK-001)", () => {
  beforeEach(resetDatabase);

  it("TRACK-001 — en amical, un invité sans compte n'empêche pas de publier", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();
    const created = await admin.caller.tracker.create({
      label: "Amical du jeudi",
      localDate: "2026-02-12",
      slotStartHour: 20,
      modeId: "friendly",
      venueId: "arena",
    });
    const sessionId = created.session.id;
    const [teamA, teamB] = created.teams;
    await admin.caller.tracker.addParticipant({
      sessionId,
      teamId: teamA!.id,
      playerId: joueur.identity.playerId,
    });
    const withGuest = await admin.caller.tracker.addParticipant({
      sessionId,
      teamId: teamB!.id,
      guestName: "Theo",
    });
    const guest = withGuest.participants.find((p) => p.playerId === null)!;
    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;
    await admin.caller.tracker.sync({
      sessionId,
      upserts: [
        {
          clientId: randomUUID(),
          matchId: match.id,
          type: "goal",
          participantId: guest.id,
          assistParticipantId: null,
          teamId: teamB!.id,
          clockMs: 60_000,
          videoMs: null,
        },
      ],
      deletions: [],
    });
    const finished = await admin.caller.tracker.updateMatch({
      matchId: match.id,
      status: "finished",
    });

    // L'invité est signalé, sans bloquer.
    const { publicationBlockers } = await import("@uno/shared");
    const warnings = publicationBlockers(finished);
    expect(warnings.some((w) => w.level === "blocking")).toBe(false);
    expect(warnings.some((w) => w.message.includes("Theo"))).toBe(true);

    const published = await admin.caller.tracker.publish({ sessionId });
    expect(published.matchesRecorded).toBe(1);

    // L'invité figure sur la feuille de match, au podium et dans son équipe.
    const proposalId = published.proposalId;
    const sheet = await admin.caller.proposals.scoreboard({ proposalId });
    const theo = sheet.find((row) => row.player.displayName === "Theo");
    expect(theo).toMatchObject({ goals: 1, movement: null });
    expect(theo!.player.id).toBeLessThan(0);
    expect(sheet[0]?.player.displayName).toBe("Theo");
    expect(
      sheet.some((row) => row.player.id === joueur.identity.playerId),
    ).toBe(true);

    const podium = await admin.caller.proposals.podium({ proposalId });
    expect(
      podium.find((entry) => entry.award === "topScorer")?.player.displayName,
    ).toBe("Theo");

    const squads = await admin.caller.proposals.teams({ proposalId });
    expect(
      squads.flatMap((team) => team.players.map((p) => p.displayName)),
    ).toContain("Theo");

    // Theo s'inscrit : l'administration le rattache à son compte, après coup.
    const theoAccount = await createPlayer();
    const before = await theoAccount.caller.players.me();
    await admin.caller.tracker.linkParticipant({
      participantId: guest.id,
      playerId: theoAccount.identity.playerId,
    });
    const after = await admin.caller.proposals.scoreboard({ proposalId });
    expect(after.some((row) => row.player.id < 0)).toBe(false);
    expect(
      after.find((row) => row.player.id === theoAccount.identity.playerId),
    ).toMatchObject({ goals: 1 });
    const me = await theoAccount.caller.players.me();
    expect(me.matchesPlayed).toBe(before.matchesPlayed + 1);
    expect(me.xp).toBeGreaterThan(before.xp);
    // Un amical n'ajoute rien aux compteurs du classement.
    expect(me.goals).toBe(before.goals);
    const history = await theoAccount.caller.players.history({ limit: 10 });
    expect(history.some((item) => item.id === proposalId)).toBe(true);
  });
});
