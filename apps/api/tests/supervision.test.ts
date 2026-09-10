import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getGameMode, parseVideoUrl } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  reloadIdentity,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Supervision des sessions (SUP-001, SUP-002).
 *
 * La saisie d'une feuille de match décide des distinctions, des UNO versés et
 * des montées de division. L'ouvrir à des superviseurs ne doit rien lui faire
 * perdre de ses garanties : ni le contrôle du droit, ni l'impossibilité de
 * juger sa propre session.
 */

const league = getGameMode("league")!;

/** Session League D1 complète et payée, prête à être saisie. */
async function playedSession(): Promise<{
  admin: TestPlayer;
  squad: TestPlayer[];
  proposalId: number;
}> {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];

  for (let index = 0; index < league.minParticipants; index++) {
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
  for (const player of squad) {
    await player.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: randomUUID(),
    });
  }

  return { admin, squad, proposalId: proposal.id };
}

/** Passe une session dans le passé : c'est là qu'elle devient saisissable. */
async function movePast(proposalId: number): Promise<void> {
  await db.execute(
    sql`UPDATE proposals SET starts_at_utc = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ${proposalId}`,
  );
}

describe("supervision (SUP-001)", () => {
  beforeEach(resetDatabase);

  it("SUP-001 — un joueur ordinaire n'accède à aucune route de saisie", async () => {
    const { proposalId, squad } = await playedSession();
    const outsider = await createPlayer();

    await expect(outsider.caller.supervision.pending()).rejects.toThrow(
      /superviseur/i,
    );
    await expect(
      outsider.caller.supervision.sheet({ proposalId }),
    ).rejects.toThrow(/superviseur/i);
    await expect(
      squad[0]!.caller.supervision.generateTeams({ proposalId }),
    ).rejects.toThrow(/superviseur/i);
  });

  it("SUP-001 — nommé superviseur, il saisit la session et le classement suit", async () => {
    const { admin, proposalId, squad } = await playedSession();
    await movePast(proposalId);

    // Un superviseur extérieur à la session : il n'y a pas joué.
    const created = await createPlayer();
    await admin.caller.admin.setSupervisor({
      playerId: created.identity.playerId,
      isSupervisor: true,
    });
    const supervisor = await reloadIdentity(created);

    const queue = await supervisor.caller.supervision.pending();
    expect(queue.map((session) => session.id)).toContain(proposalId);

    const teams = await supervisor.caller.supervision.generateTeams({ proposalId });
    expect(teams).toHaveLength(3);

    const matches = await supervisor.caller.supervision.sheet({ proposalId });
    const match = matches.matches[0]!;

    await supervisor.caller.supervision.record({
      proposalId,
      matches: [
        {
          matchId: match.id,
          scoreA: 4,
          scoreB: 1,
          stats: [
            ...(match.teamA?.players ?? []),
            ...(match.teamB?.players ?? []),
          ].map((player, index) => ({
            playerId: player.id,
            goals: 10 - index,
            assists: 0,
            defenses: 0,
            saves: 0,
          })),
        },
      ],
      complete: true,
    });

    // La saisie d'un superviseur produit exactement les mêmes effets que
    // celle de l'administration : session clôturée et classement de session.
    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.status).toBe("completed");
    // Un seul match a été saisi : seuls les dix joueurs qui l'ont disputé
    // figurent au classement de session, et le premier y est bien premier.
    const ranked = detail.participants.filter((row) => row.sessionRank !== null);
    expect(ranked).toHaveLength(10);
    expect(ranked[0]?.sessionRank).toBe(1);

    // Et le joueur le mieux classé a bien encaissé ses buts au classement.
    const board = await supervisor.caller.ranking.list({ division: "D1" });
    expect(board.entries.some((entry) => entry.player.goals > 0)).toBe(true);

    // Le droit retiré referme la porte immédiatement.
    await admin.caller.admin.setSupervisor({
      playerId: supervisor.identity.playerId,
      isSupervisor: false,
    });
    const demoted = await reloadIdentity(supervisor);
    await expect(demoted.caller.supervision.pending()).rejects.toThrow(
      /superviseur/i,
    );

    expect(squad).toHaveLength(league.minParticipants);
  });

  it("SUP-001 — un superviseur ne saisit pas la session qu'il a jouée", async () => {
    const { admin, proposalId, squad } = await playedSession();
    await movePast(proposalId);

    await admin.caller.admin.setSupervisor({
      playerId: squad[0]!.identity.playerId,
      isSupervisor: true,
    });
    const player = await reloadIdentity(squad[0]!);

    // Elle ne lui est pas proposée…
    const queue = await player.caller.supervision.pending();
    expect(queue.map((session) => session.id)).not.toContain(proposalId);

    // …et la demander directement ne contourne rien.
    await expect(player.caller.supervision.sheet({ proposalId })).rejects.toThrow(
      /joué cette session/i,
    );
    await expect(
      player.caller.supervision.generateTeams({ proposalId }),
    ).rejects.toThrow(/joué cette session/i);

    // L'administration, elle, saisit sa propre session : c'est elle qui
    // tranche les litiges, et une ligue dont l'organisateur joue serait bloquée.
    await expect(
      admin.caller.supervision.sheet({ proposalId }),
    ).resolves.toBeTruthy();
  });

  it("SUP-001 — l'arbitre de la session ne la saisit pas non plus", async () => {
    const { admin, proposalId } = await playedSession();

    const created = await createPlayer({ accountType: "referee" });
    await created.caller.proposals.becomeReferee({ proposalId });
    await admin.caller.admin.setSupervisor({
      playerId: created.identity.playerId,
      isSupervisor: true,
    });
    const referee = await reloadIdentity(created);
    await movePast(proposalId);

    const queue = await referee.caller.supervision.pending();
    expect(queue.map((session) => session.id)).not.toContain(proposalId);
    await expect(
      referee.caller.supervision.sheet({ proposalId }),
    ).rejects.toThrow(/arbitré cette session/i);
  });
});

describe("vidéos de session (SUP-002)", () => {
  beforeEach(resetDatabase);

  it("SUP-002 — plusieurs vidéos par session, YouTube et Vimeo intégrables", async () => {
    const { admin, proposalId } = await playedSession();
    await movePast(proposalId);

    await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://youtu.be/dQw4w9WgXcQ",
      label: "1re heure",
    });
    const videos = await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://vimeo.com/123456789",
      label: "2e heure",
    });

    expect(videos).toHaveLength(2);
    const youtube = videos.find((video) => video.provider === "youtube");
    const vimeo = videos.find((video) => video.provider === "vimeo");

    // L'adresse intégrée est **reconstruite** par le serveur : jamais celle
    // que le client a envoyée.
    expect(youtube?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(vimeo?.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });

  it("SUP-002 — un hébergeur inconnu reste un lien, jamais un cadre intégré", async () => {
    const { admin, proposalId } = await playedSession();

    const videos = await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://drive.example.com/fichier/abc",
    });

    expect(videos[0]?.provider).toBe("other");
    expect(videos[0]?.embedUrl).toBeNull();
  });

  it("SUP-002 — une adresse qui n'est pas http(s) est refusée", async () => {
    const { admin, proposalId } = await playedSession();

    await expect(
      admin.caller.supervision.addVideo({
        proposalId,
        // Une adresse `javascript:` ne doit jamais franchir cette porte.
        url: "javascript:alert(1)",
      }),
    ).rejects.toThrow();

    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("data:text/html,<script>")).toBeNull();
  });

  it("SUP-002 — les vidéos ne sont visibles que des participants", async () => {
    const { admin, proposalId, squad } = await playedSession();
    await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    // Un joueur de la session la voit.
    const seen = await squad[0]!.caller.supervision.videos({ proposalId });
    expect(seen).toHaveLength(1);

    // Un joueur qui n'y était pas ne la voit pas.
    const outsider = await createPlayer();
    await expect(
      outsider.caller.supervision.videos({ proposalId }),
    ).rejects.toThrow(/réservées/i);
  });

  it("SUP-002 — seul un superviseur ajoute ou retire une vidéo", async () => {
    const { admin, proposalId, squad } = await playedSession();

    await expect(
      squad[0]!.caller.supervision.addVideo({
        proposalId,
        url: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).rejects.toThrow(/superviseur/i);

    const added = await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    const left = await admin.caller.supervision.removeVideo({
      proposalId,
      videoId: added[0]!.id,
    });
    expect(left).toHaveLength(0);
  });
});
