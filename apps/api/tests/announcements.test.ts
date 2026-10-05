import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { notificationDeliveries } from "../src/db/schema.js";
import {
  createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Annonces créées depuis l'administration (ANN-005).
 *
 * Une annonce porte un titre, un texte et des images ; la publier prévient
 * chaque joueur visé — notification dans l'application, et push quand il en
 * a — une seule fois. La corriger ne renotifie personne, la supprimer la
 * retire de l'application.
 */

async function deliveriesFor(announcementId: number) {
  return db
    .select({
      playerId: notificationDeliveries.playerId,
      title: notificationDeliveries.title,
      body: notificationDeliveries.body,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.eventKey, `announcement:${announcementId}`),
        eq(notificationDeliveries.channel, "inapp"),
      ),
    );
}

async function publish(
  admin: TestPlayer,
  input: Partial<{
    title: string;
    content: string;
    images: string[];
    targetDivision: "D1" | "D2" | "D3" | null;
  }> = {},
): Promise<number> {
  return admin.caller.admin.createAnnouncement({
    title: input.title ?? "Tournoi de rentrée",
    content: input.content ?? "Inscriptions ouvertes jusqu'au 15 octobre.",
    images: input.images ?? [],
    targetDivision: input.targetDivision ?? null,
    publishNow: true,
  });
}

describe("annonces de l'administration (ANN-005)", () => {
  beforeEach(resetDatabase);

  it("ANN-005 — publier une annonce illustrée notifie chaque joueur, une fois", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const alice = await createPlayer();
    const bob = await createPlayer();

    const id = await publish(admin, {
      images: [
        "/uploads/announcements/affiche.webp",
        "https://exemple.be/photo.jpg",
      ],
    });

    const { items } = await alice.caller.announcements.list({ limit: 20 });
    expect(items).toEqual([
      expect.objectContaining({
        id,
        title: "Tournoi de rentrée",
        images: [
          "/uploads/announcements/affiche.webp",
          "https://exemple.be/photo.jpg",
        ],
        read: false,
      }),
    ]);

    const deliveries = await deliveriesFor(id);
    const notified = deliveries
      .map((row) => row.playerId)
      .sort((a, b) => a - b);
    expect(notified).toEqual(
      [admin, alice, bob].map((p) => p.identity.playerId).sort((a, b) => a - b),
    );
    expect(deliveries[0]).toMatchObject({
      title: "Nouvelle annonce",
      body: "Tournoi de rentrée",
    });
  });

  it("ANN-005 — une annonce ciblée ne prévient que sa division", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const d2 = await createPlayer();
    const d3 = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: d2.identity.playerId,
      division: "D2",
    });

    const id = await publish(admin, { targetDivision: "D2" });

    const notified = (await deliveriesFor(id)).map((row) => row.playerId);
    expect(notified).toContain(d2.identity.playerId);
    expect(notified).not.toContain(d3.identity.playerId);
    expect((await d3.caller.announcements.list({ limit: 20 })).items).toEqual(
      [],
    );
  });

  it("ANN-005 — corriger ne renotifie pas, supprimer retire l'annonce", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();
    const id = await publish(admin);

    await admin.caller.admin.updateAnnouncement({
      announcementId: id,
      title: "Tournoi de rentrée — nouvelle date",
      content: "Inscriptions ouvertes jusqu'au 20 octobre.",
      images: ["/uploads/announcements/nouvelle-affiche.webp"],
    });
    expect(await deliveriesFor(id)).toHaveLength(2);

    const [listed] = await admin.caller.admin.announcements();
    expect(listed).toMatchObject({
      id,
      title: "Tournoi de rentrée — nouvelle date",
      images: ["/uploads/announcements/nouvelle-affiche.webp"],
      readCount: 0,
    });

    await joueur.caller.announcements.get({ announcementId: id });
    expect((await admin.caller.admin.announcements())[0]?.readCount).toBe(1);

    await admin.caller.admin.deleteAnnouncement({ announcementId: id });
    expect(
      (await joueur.caller.announcements.list({ limit: 20 })).items,
    ).toEqual([]);
    expect(await admin.caller.admin.announcements()).toEqual([]);
    await expect(
      admin.caller.admin.deleteAnnouncement({ announcementId: id }),
    ).rejects.toMatchObject({ message: "Cette annonce est introuvable." });
  });

  it("ANN-005 — réservé à l'administration, images contrôlées", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();

    await expect(
      joueur.caller.admin.createAnnouncement({
        title: "Pirate",
        content: "…",
        images: [],
        targetDivision: null,
        publishNow: true,
      }),
    ).rejects.toThrow();

    await expect(
      publish(admin, { images: ["/uploads/../../etc/passwd"] }),
    ).rejects.toThrow();
  });
});
