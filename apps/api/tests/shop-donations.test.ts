import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DONATION_CATEGORY } from "@uno/shared";
import { db } from "../src/db/client.js";
import { notificationDeliveries } from "../src/db/schema.js";
import {
  balanceOf,
  // Les joueurs de ce fichier ont de quoi payer : voir `createFundedPlayer`.
  createFundedPlayer as createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Dons et propositions de produits (SHOP-008, SHOP-009).
 *
 * Deux règles y sont vérifiées de bout en bout : un don ne part jamais sans
 * association nommée, et une proposition de produit trouve toujours une
 * réponse chez son auteur.
 */

async function createDonation(
  admin: TestPlayer,
  priceUno = 250,
): Promise<number> {
  return admin.caller.admin.createShopItem({
    name: "Don solidaire",
    description: "Reversé à l'association de votre choix.",
    category: DONATION_CATEGORY,
    priceUno,
    priceEuros: null,
    productUrl: null,
    images: [],
    sizeKind: "none",
    sizes: [],
    available: true,
    stock: null,
  });
}

async function createCharity(
  admin: TestPlayer,
  overrides: Partial<{ name: string; active: boolean }> = {},
): Promise<number> {
  const charity = await admin.caller.admin.createCharity({
    name: overrides.name ?? `Association ${randomUUID().slice(0, 8)}`,
    description: "Aide les clubs de quartier.",
    imageUrl: null,
    websiteUrl: "https://example.org/association",
    active: overrides.active ?? true,
  });
  return charity.id;
}

describe("dons à une association (SHOP-008)", () => {
  beforeEach(resetDatabase);

  it("un don enregistre l'association choisie et fige son nom", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const donationId = await createDonation(admin, 250);
    const charityId = await createCharity(admin, { name: "Ballon Partagé" });

    const result = await buyer.caller.shop.purchase({
      items: [{ shopItemId: donationId, quantity: 1, charityId }],
      idempotencyKey: randomUUID(),
    });

    expect(result.order.status).toBe("paid");
    expect(result.order.items[0]?.charityName).toBe("Ballon Partagé");
  });

  it("un don sans association est refusé, sans débit", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const donationId = await createDonation(admin, 250);
    await createCharity(admin);

    const before = await balanceOf(buyer.identity.playerId);

    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: donationId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await balanceOf(buyer.identity.playerId)).toBe(before);
    const orders = await buyer.caller.shop.orders({ limit: 20 });
    expect(orders.items).toHaveLength(0);
  });

  it("une association retirée n'accepte plus de don", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const donationId = await createDonation(admin, 250);
    const charityId = await createCharity(admin, { active: false });

    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: donationId, quantity: 1, charityId }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("une association sur un article ordinaire est refusée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const charityId = await createCharity(admin);
    const productId = await admin.caller.admin.createShopItem({
      name: "Gourde",
      description: "Acier inoxydable.",
      category: "accessories",
      priceUno: 100,
      priceEuros: null,
      productUrl: null,
      images: [],
      sizeKind: "none",
      sizes: [],
      available: true,
      stock: null,
    });

    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1, charityId }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("le joueur ne voit que les associations actives", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();
    await createCharity(admin, { name: "Visible", active: true });
    await createCharity(admin, { name: "Retirée", active: false });

    const offered = await player.caller.shop.charities();
    expect(offered.map((charity) => charity.name)).toEqual(["Visible"]);

    // L'administration, elle, les voit toutes : rien n'a été supprimé.
    const all = await admin.caller.admin.charities();
    expect(all).toHaveLength(2);
  });

  it("la gestion des associations est refusée à un joueur ordinaire", async () => {
    const player = await createPlayer();

    await expect(
      player.caller.admin.createCharity({
        name: "Association pirate",
        description: "",
        imageUrl: null,
        websiteUrl: "https://example.org/pirate",
        active: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("propositions de produits (SHOP-009)", () => {
  beforeEach(resetDatabase);

  it("une proposition retenue notifie son auteur", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();

    const suggestion = await player.caller.shop.suggest({
      title: "Chaussettes de compression",
      description: "Elles tiennent la cheville et limitent les crampes.",
      url: "https://example.com/chaussettes",
    });
    expect(suggestion.status).toBe("pending");

    const pending = await admin.caller.admin.suggestions({
      status: "pending",
      limit: 10,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.player?.id).toBe(player.identity.playerId);

    await admin.caller.admin.decideSuggestion({
      suggestionId: suggestion.id,
      decision: "approved",
      note: "Bonne idée.",
    });

    const mine = await player.caller.shop.mySuggestions();
    expect(mine[0]).toMatchObject({
      status: "approved",
      decisionNote: "Bonne idée.",
    });

    const notifications = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.playerId, player.identity.playerId));

    expect(
      notifications.some((row) => row.title === "Proposition retenue"),
    ).toBe(true);
  });

  it("une proposition écartée notifie aussi son auteur", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();

    const suggestion = await player.caller.shop.suggest({
      title: "Trottinette électrique",
      description: "Pour venir à la salle sans se fatiguer les jambes.",
      url: "https://example.com/trottinette",
    });

    await admin.caller.admin.decideSuggestion({
      suggestionId: suggestion.id,
      decision: "rejected",
      note: "Hors sujet pour la ligue.",
    });

    const notifications = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.playerId, player.identity.playerId));

    expect(
      notifications.some((row) => row.title === "Proposition écartée"),
    ).toBe(true);
  });

  it("une proposition déjà tranchée ne se décide pas deux fois", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();

    const suggestion = await player.caller.shop.suggest({
      title: "Sac à dos imperméable",
      description: "Avec un compartiment séparé pour les crampons.",
      url: "https://example.com/sac",
    });

    await admin.caller.admin.decideSuggestion({
      suggestionId: suggestion.id,
      decision: "approved",
      note: null,
    });

    await expect(
      admin.caller.admin.decideSuggestion({
        suggestionId: suggestion.id,
        decision: "rejected",
        note: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("un joueur ne voit pas les propositions des autres", async () => {
    const player = await createPlayer();
    const other = await createPlayer();

    await other.caller.shop.suggest({
      title: "Ballon de futsal",
      description: "Taille 4 à rebond contrôlé, homologué salle.",
      url: "https://example.com/ballon",
    });

    expect(await player.caller.shop.mySuggestions()).toHaveLength(0);
  });

  it("la file des propositions est fermée à un joueur ordinaire", async () => {
    const player = await createPlayer();

    await expect(
      player.caller.admin.suggestions({ limit: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cinq propositions en attente suffisent : la sixième est refusée", async () => {
    const player = await createPlayer();

    for (let index = 0; index < 5; index++) {
      await player.caller.shop.suggest({
        title: `Produit ${index}`,
        description: "Une description assez longue pour être acceptée.",
        url: `https://example.com/produit-${index}`,
      });
    }

    await expect(
      player.caller.shop.suggest({
        title: "Produit de trop",
        description: "Une description assez longue pour être acceptée.",
        url: "https://example.com/produit-de-trop",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
