import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/client.js";
import { notificationDeliveries } from "../src/db/schema.js";
import {
  createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Les vidéos de séance déposées sur le stockage de la ligue (SUP-004).
 *
 * Le stockage lui-même (R2) n'existe pas en test : il est simulé ici. Ce que
 * ces tests protègent est ailleurs — qui peut lire une vidéo, qu'une clé
 * d'envoi ne désigne que la séance et le rôle prévus, qu'un remplacement
 * efface l'ancien fichier, que les joueurs sont prévenus une fois.
 */

const storage = vi.hoisted(() => ({
  enabled: true,
  deleted: [] as string[],
  aborted: [] as string[],
}));

vi.mock("../src/storage/videos.js", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../src/storage/videos.js")>();
  return {
    ...real,
    videoStorageEnabled: () => storage.enabled,
    startMultipartUpload: async (_key: string, bytes: number) => ({
      uploadId: "envoi-1",
      urls: Array.from(
        { length: real.partCount(bytes) },
        (_, i) => `https://stockage.test/part/${i + 1}`,
      ),
    }),
    completeMultipartUpload: async () => 123_000_000,
    abortMultipartUpload: async (key: string) => {
      storage.aborted.push(key);
    },
    signedVideoUrl: async (key: string) => `https://stockage.test/${key}?sig=1`,
    deleteVideoObject: async (key: string) => {
      storage.deleted.push(key);
    },
  };
});

async function playedFriendly(admin: TestPlayer, slotStartHour = 18) {
  const { proposal } = await admin.caller.admin.createProposal({
    date: daysFromNow(3),
    slotStartHour,
    venueId: "arena",
    modeId: "friendly",
  });
  // Une séance jouée hier : la vidéo arrive après le match.
  await db.execute(
    sql`UPDATE proposals SET status = 'completed', starts_at_utc = ${new Date(Date.now() - 86_400_000)} WHERE id = ${proposal.id}`,
  );
  return proposal.id;
}

async function uploadMatch(admin: TestPlayer, proposalId: number) {
  const ticket = await admin.caller.supervision.startVideoUpload({
    proposalId,
    role: "match",
    bytes: 40 * 1024 * 1024,
    contentType: "video/mp4",
  });
  const list = await admin.caller.supervision.completeVideoUpload({
    proposalId,
    role: "match",
    key: ticket.key,
    uploadId: ticket.uploadId,
    parts: ticket.urls.map((_, i) => ({ partNumber: i + 1, etag: `"e${i}"` })),
  });
  return { ticket, list };
}

describe("vidéos de séance sur le stockage de la ligue (SUP-004)", () => {
  beforeEach(async () => {
    await resetDatabase();
    storage.enabled = true;
    storage.deleted.length = 0;
    storage.aborted.length = 0;
  });

  it("SUP-004 — le match complet déposé n'est lisible que par les joueurs de la séance", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposalId = await playedFriendly(admin);
    const joueur = await createPlayer();
    await db.execute(
      sql`INSERT INTO proposal_participants (proposal_id, player_id) VALUES (${proposalId}, ${joueur.identity.playerId})`,
    );
    const intrus = await createPlayer();

    const { ticket, list } = await uploadMatch(admin, proposalId);
    // Quarante mégaoctets en morceaux de seize : trois adresses signées.
    expect(ticket.urls).toHaveLength(3);
    expect(ticket.key).toMatch(new RegExp(`^seances/${proposalId}/match-`));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      role: "match",
      source: "file",
      bytes: 123_000_000,
      moments: [],
    });

    // Le joueur reçoit une adresse signée ; l'inconnu, un refus.
    const vues = await joueur.caller.supervision.videos({ proposalId });
    expect(vues[0]?.url).toBe(`https://stockage.test/${ticket.key}?sig=1`);
    await expect(
      intrus.caller.supervision.videos({ proposalId }),
    ).rejects.toThrow(/réservées à ceux qui y ont joué/);

    // Le joueur est prévenu, une fois.
    const prevenus = await db
      .select({ playerId: notificationDeliveries.playerId })
      .from(notificationDeliveries)
      .where(
        sql`event_key = ${`proposal:${proposalId}:video-online`} AND channel = 'inapp'`,
      );
    expect(prevenus.map((row) => row.playerId)).toContain(
      joueur.identity.playerId,
    );
    await uploadMatch(admin, proposalId);
    const encore = await db
      .select({ playerId: notificationDeliveries.playerId })
      .from(notificationDeliveries)
      .where(
        sql`event_key = ${`proposal:${proposalId}:video-online`} AND channel = 'inapp' AND player_id = ${joueur.identity.playerId}`,
      );
    expect(encore).toHaveLength(1);
  });

  it("SUP-004 — un nouveau match complet remplace l'ancien et efface son fichier", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposalId = await playedFriendly(admin);
    const first = await uploadMatch(admin, proposalId);
    const second = await uploadMatch(admin, proposalId);

    expect(second.list.filter((v) => v.role === "match")).toHaveLength(1);
    expect(storage.deleted).toEqual([first.ticket.key]);

    // Retirer la vidéo efface aussi son fichier.
    const [video] = second.list;
    await admin.caller.supervision.removeVideo({
      proposalId,
      videoId: video!.id,
    });
    expect(storage.deleted).toEqual([first.ticket.key, second.ticket.key]);
  });

  it("SUP-004 — une clé d'envoi ne vaut que pour sa séance et son rôle", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposalId = await playedFriendly(admin);
    // Un autre créneau : le même aurait rendu la même séance.
    const autre = await playedFriendly(admin, 20);
    expect(autre).not.toBe(proposalId);
    const ticket = await admin.caller.supervision.startVideoUpload({
      proposalId: autre,
      role: "match",
      bytes: 1_000_000,
      contentType: "video/mp4",
    });

    await expect(
      admin.caller.supervision.completeVideoUpload({
        proposalId,
        role: "match",
        key: ticket.key,
        uploadId: ticket.uploadId,
        parts: [{ partNumber: 1, etag: '"e"' }],
      }),
    ).rejects.toThrow(/ne correspond à aucune vidéo/);
    await expect(
      admin.caller.supervision.completeVideoUpload({
        proposalId: autre,
        role: "summary",
        key: ticket.key,
        uploadId: ticket.uploadId,
        parts: [{ partNumber: 1, etag: '"e"' }],
      }),
    ).rejects.toThrow(/ne correspond à aucune vidéo/);

    // Un joueur ordinaire n'ouvre aucun envoi.
    const joueur = await createPlayer();
    await expect(
      joueur.caller.supervision.startVideoUpload({
        proposalId,
        role: "match",
        bytes: 1_000_000,
        contentType: "video/mp4",
      }),
    ).rejects.toThrow();
  });

  it("SUP-004 — les moments-clés se corrigent, triés, et se lisent avec la vidéo", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const proposalId = await playedFriendly(admin);
    const { list } = await uploadMatch(admin, proposalId);
    const videoId = list[0]!.id;

    const saved = await admin.caller.supervision.setVideoMoments({
      proposalId,
      videoId,
      moments: [
        {
          t: 731,
          kind: "goal",
          minute: 12,
          label: "But de Bilal Saidi",
          detail: "Équipe A · 1-0",
        },
        {
          t: 12,
          kind: "kickoff",
          minute: 0,
          label: "Coup d'envoi",
          detail: "",
        },
      ],
    });
    expect(saved[0]?.moments.map((m) => m.t)).toEqual([12, 731]);

    await expect(
      admin.caller.supervision.setVideoMoments({
        proposalId,
        videoId,
        moments: [{ t: 5, kind: "goal", minute: 1, label: " ", detail: "" }],
      }),
    ).rejects.toThrow(/titre au moment/);

    const joueur = await createPlayer();
    await expect(
      joueur.caller.supervision.setVideoMoments({
        proposalId,
        videoId,
        moments: [],
      }),
    ).rejects.toThrow();
  });

  it("SUP-004 — sans stockage configuré, seuls les liens restent", async () => {
    storage.enabled = false;
    const admin = await promoteToAdmin(await createPlayer());
    const proposalId = await playedFriendly(admin);

    expect(await admin.caller.supervision.videoStorage()).toMatchObject({
      enabled: false,
    });
    await expect(
      admin.caller.supervision.startVideoUpload({
        proposalId,
        role: "summary",
        bytes: 1_000_000,
        contentType: "video/mp4",
      }),
    ).rejects.toThrow(/pas configuré/);

    // Un lien YouTube tient le rôle de résumé, et le suivant le remplace.
    await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://youtu.be/abcdefghijk",
      role: "summary",
    });
    const list = await admin.caller.supervision.addVideo({
      proposalId,
      url: "https://www.youtube.com/watch?v=zyxwvutsrqp",
      role: "summary",
    });
    expect(list.filter((v) => v.role === "summary")).toHaveLength(1);
    expect(list[0]?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/zyxwvutsrqp",
    );
  });

  it("SUP-004 — la console liste les séances jouées et ce qu'elles ont déjà", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    // Deux séances, la vidéo sur la seconde : les identifiants des séances et
    // des vidéos ne coïncident pas.
    const sansVideo = await playedFriendly(admin, 18);
    const proposalId = await playedFriendly(admin, 20);
    await uploadMatch(admin, proposalId);

    const rows = await admin.caller.supervision.videoSessions();
    expect(rows.find((r) => r.proposalId === proposalId)).toMatchObject({
      hasMatch: true,
      hasSummary: false,
      videos: 1,
    });
    expect(rows.find((r) => r.proposalId === sansVideo)).toMatchObject({
      hasMatch: false,
      videos: 0,
    });
    expect((await admin.caller.supervision.videoStorage()).usedBytes).toBe(
      123_000_000,
    );
  });
});
