import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { SIGNUP_BONUS_UNO } from "@uno/shared";
import { db } from "../src/db/client.js";
import { auditPlayerBalance } from "../src/services/ledger.service.js";
import {
  balanceOf,
  createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

async function createProduct(
  admin: TestPlayer,
  overrides: Partial<{
    name: string;
    priceUno: number;
    stock: number | null;
    available: boolean;
    sizeKind: "none" | "clothing" | "shoes";
    sizes: string[];
  }> = {},
): Promise<number> {
  return admin.caller.admin.createShopItem({
    name: overrides.name ?? "Produit de test",
    description: "Description de test",
    category: "accessories",
    priceUno: overrides.priceUno ?? 300,
    priceEuros: null,
    productUrl: null,
    images: [],
    sizeKind: overrides.sizeKind ?? "none",
    sizes: overrides.sizes ?? [],
    available: overrides.available ?? true,
    stock: overrides.stock === undefined ? null : overrides.stock,
  });
}

describe("wallet UNO", () => {
  beforeEach(resetDatabase);

  it("E2E-010 — un transfert débite, crédite et laisse deux écritures liées", async () => {
    const sender = await createPlayer();
    const recipient = await createPlayer();

    await sender.caller.wallet.send({
      toPlayerId: recipient.identity.playerId,
      amount: 100,
      note: "Merci pour la passe",
      idempotencyKey: randomUUID(),
    });

    expect(await balanceOf(sender.identity.playerId)).toBe(SIGNUP_BONUS_UNO - 100);
    expect(await balanceOf(recipient.identity.playerId)).toBe(SIGNUP_BONUS_UNO + 100);

    const senderWallet = await sender.caller.wallet.summary();
    const recipientWallet = await recipient.caller.wallet.summary();

    expect(senderWallet.transactions[0]).toMatchObject({
      type: "send",
      amount: -100,
      balanceAfter: SIGNUP_BONUS_UNO - 100,
    });
    expect(recipientWallet.transactions[0]).toMatchObject({
      type: "receive",
      amount: 100,
      balanceAfter: SIGNUP_BONUS_UNO + 100,
    });
  });

  it("WAL-001 — un transfert supérieur au solde est refusé sans effet", async () => {
    const sender = await createPlayer();
    const recipient = await createPlayer();

    await expect(
      sender.caller.wallet.send({
        toPlayerId: recipient.identity.playerId,
        amount: SIGNUP_BONUS_UNO + 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    expect(await balanceOf(sender.identity.playerId)).toBe(SIGNUP_BONUS_UNO);
    expect(await balanceOf(recipient.identity.playerId)).toBe(SIGNUP_BONUS_UNO);
  });

  it("WAL-002 — l'auto-transfert est interdit", async () => {
    const player = await createPlayer();
    await expect(
      player.caller.wallet.send({
        toPlayerId: player.identity.playerId,
        amount: 10,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  it("WAL-002 — un destinataire inexistant est refusé (aucun joueur fantôme)", async () => {
    const player = await createPlayer();
    await expect(
      player.caller.wallet.send({
        toPlayerId: 999_999,
        amount: 10,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await balanceOf(player.identity.playerId)).toBe(SIGNUP_BONUS_UNO);
  });

  it("STATE-002 — un transfert rejoué avec la même clé ne débite qu'une fois", async () => {
    const sender = await createPlayer();
    const recipient = await createPlayer();
    const key = randomUUID();

    await sender.caller.wallet.send({
      toPlayerId: recipient.identity.playerId,
      amount: 50,
      idempotencyKey: key,
    });
    const replay = await sender.caller.wallet.send({
      toPlayerId: recipient.identity.playerId,
      amount: 50,
      idempotencyKey: key,
    });

    expect(replay.replayed).toBe(true);
    expect(await balanceOf(sender.identity.playerId)).toBe(SIGNUP_BONUS_UNO - 50);
    expect(await balanceOf(recipient.identity.playerId)).toBe(SIGNUP_BONUS_UNO + 50);
  });

  it("WAL-006 — le solde reste cohérent avec le registre après plusieurs mouvements", async () => {
    const sender = await createPlayer();
    const recipient = await createPlayer();

    for (const amount of [10, 25, 100, 7]) {
      await sender.caller.wallet.send({
        toPlayerId: recipient.identity.playerId,
        amount,
        idempotencyKey: randomUUID(),
      });
    }

    const senderAudit = await auditPlayerBalance(db, sender.identity.playerId);
    const recipientAudit = await auditPlayerBalance(db, recipient.identity.playerId);

    expect(senderAudit.consistent).toBe(true);
    expect(recipientAudit.consistent).toBe(true);
    expect(senderAudit.balance).toBe(SIGNUP_BONUS_UNO - 142);
    expect(recipientAudit.balance).toBe(SIGNUP_BONUS_UNO + 142);
  });

  it("WAL-004 — l'historique est trié du plus récent au plus ancien", async () => {
    const sender = await createPlayer();
    const recipient = await createPlayer();

    for (const amount of [1, 2, 3]) {
      await sender.caller.wallet.send({
        toPlayerId: recipient.identity.playerId,
        amount,
        idempotencyKey: randomUUID(),
      });
    }

    const wallet = await sender.caller.wallet.summary();
    const ids = wallet.transactions.map((t) => t.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    expect(wallet.transactions[0]?.amount).toBe(-3);
  });

  it("la recherche de destinataire exclut le joueur courant", async () => {
    const player = await createPlayer({ firstName: "Zinedine", lastName: "Dupont" });
    const other = await createPlayer({ firstName: "Zlatan", lastName: "Dupont" });

    const results = await player.caller.wallet.searchRecipients({
      query: "Dupont",
      limit: 10,
    });
    const ids = results.map((r) => r.id);

    expect(ids).toContain(other.identity.playerId);
    expect(ids).not.toContain(player.identity.playerId);
  });

  it("SEC-004 — une recherche contenant des caractères SQL ne casse rien", async () => {
    const player = await createPlayer();
    const results = await player.caller.wallet.searchRecipients({
      query: "'; DROP TABLE players; --",
      limit: 10,
    });
    expect(results).toEqual([]);

    // La table est intacte : le joueur courant est toujours lisible.
    const profile = await player.caller.players.me();
    expect(profile.id).toBe(player.identity.playerId);
  });
});

describe("boutique et commandes", () => {
  beforeEach(resetDatabase);

  it("E2E-011 — un achat crée une commande, débite et écrit une transaction", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 300 });

    const result = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 2 }],
      idempotencyKey: randomUUID(),
    });

    expect(result.order.status).toBe("paid");
    expect(result.order.totalUno).toBe(600);
    expect(result.order.items[0]).toMatchObject({ quantity: 2, unitPriceUno: 300 });
    expect(await balanceOf(buyer.identity.playerId)).toBe(SIGNUP_BONUS_UNO - 600);

    const wallet = await buyer.caller.wallet.summary();
    expect(wallet.transactions[0]).toMatchObject({ type: "purchase", amount: -600 });
  });

  it("SHOP-005 — un solde insuffisant ne laisse ni débit ni commande", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: SIGNUP_BONUS_UNO + 1 });

    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    expect(await balanceOf(buyer.identity.playerId)).toBe(SIGNUP_BONUS_UNO);
    const orders = await buyer.caller.shop.orders({ limit: 20 });
    expect(orders.items).toHaveLength(0);
  });

  it("solde exactement égal au prix : l'achat passe et le solde tombe à zéro", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: SIGNUP_BONUS_UNO });

    await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    expect(await balanceOf(buyer.identity.playerId)).toBe(0);
  });

  it("E2E-009 — deux achats simultanés sur un solde qui n'en permet qu'un", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    // 600 × 2 = 1200 > 1000 : un seul achat peut aboutir.
    const productId = await createProduct(admin, { priceUno: 600 });

    const results = await Promise.allSettled([
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const balance = await balanceOf(buyer.identity.playerId);
    expect(balance).toBe(SIGNUP_BONUS_UNO - 600);
    // Jamais de solde négatif, quelle que soit la concurrence.
    expect(balance).toBeGreaterThanOrEqual(0);

    const audit = await auditPlayerBalance(db, buyer.identity.playerId);
    expect(audit.consistent).toBe(true);
  });

  it("STATE-002 — un double tap sur Acheter ne débite qu'une fois", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 200 });
    const key = randomUUID();

    await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: key,
    });
    const replay = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: key,
    });

    expect(replay.replayed).toBe(true);
    expect(await balanceOf(buyer.identity.playerId)).toBe(SIGNUP_BONUS_UNO - 200);

    const orders = await buyer.caller.shop.orders({ limit: 20 });
    expect(orders.items).toHaveLength(1);
  });

  it("SHOP-001 — un produit indisponible n'apparaît pas au catalogue", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    await createProduct(admin, { name: "Visible", available: true });
    await createProduct(admin, { name: "Masqué", available: false });

    const catalogue = await buyer.caller.shop.items({ category: "all" });
    expect(catalogue.map((item) => item.name)).toEqual(["Visible"]);
  });

  it("produit désactivé entre l'affichage et l'achat : refus propre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 100 });

    await admin.caller.admin.updateShopItem({
      shopItemId: productId,
      data: {
        name: "Produit de test",
        description: "Description de test",
        category: "accessories",
        priceUno: 100,
        priceEuros: null,
        productUrl: null,
        images: [],
        available: false,
        stock: null,
      },
    });

    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await balanceOf(buyer.identity.playerId)).toBe(SIGNUP_BONUS_UNO);
  });

  it("le stock est décrémenté et bloque l'achat quand il est épuisé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 100, stock: 1 });

    await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("ADMIN-004 — un produit déjà commandé est archivé, jamais supprimé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 100 });

    await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    const result = await admin.caller.admin.removeShopItem({ shopItemId: productId });
    expect(result.archived).toBe(true);

    // L'historique du joueur reste lisible.
    const orders = await buyer.caller.shop.orders({ limit: 20 });
    expect(orders.items[0]?.items[0]?.productName).toBe("Produit de test");

    // Et le produit disparaît bien du catalogue.
    const catalogue = await buyer.caller.shop.items({ category: "all" });
    expect(catalogue).toHaveLength(0);
  });

  it("ROLE-002 — un joueur ne peut pas lire la commande d'un autre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const intruder = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 100 });

    const { order } = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    await expect(
      intruder.caller.shop.order({ orderId: order.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  /**
   * Régression : `recordAdminEvent` écrivait sur une connexion distincte alors
   * que la transaction d'achat verrouillait la ligne du joueur. La clé
   * étrangère de `admin_events` vers `players` attendait ce verrou jusqu'au
   * timeout — cinquante secondes par commande, puis un évènement perdu.
   *
   * Le test échoue par dépassement de délai si la faute revient, et vérifie
   * que l'évènement est bien enregistré.
   */
  it("ADMIN-006 — un achat notifie l'administration sans attendre de verrou", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 100 });

    const started = Date.now();
    const { order } = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    // Une seconde suffit largement ; le défaut mettait cinquante secondes.
    expect(Date.now() - started).toBeLessThan(5_000);

    const events = await admin.caller.admin.events({ limit: 20, unreadOnly: false });
    expect(
      events.find(
        (event) => event.type === "order.created" && event.entityId === order.id,
      ),
    ).toBeDefined();
  });

  it("SHOP-005 — un joueur annule sa commande non confirmée et récupère ses UNO", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 250, stock: 3 });

    const before = await balanceOf(buyer.identity.playerId);
    const { order } = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    expect(await balanceOf(buyer.identity.playerId)).toBe(before - 250);

    const cancelled = await buyer.caller.shop.cancelOrder({ orderId: order.id });
    expect(cancelled.status).toBe("cancelled");
    expect(await balanceOf(buyer.identity.playerId)).toBe(before);

    // Le stock est rendu : l'article n'a jamais quitté l'entrepôt.
    const catalogue = await buyer.caller.shop.items({ category: "all" });
    expect(catalogue[0]?.stock).toBe(3);

    // Une commande livrée, elle, n'est plus annulable par le joueur.
    const { order: second } = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    await admin.caller.admin.setOrderStatus({
      orderId: second.id,
      status: "fulfilled",
    });
    await expect(
      buyer.caller.shop.cancelOrder({ orderId: second.id }),
    ).rejects.toThrow(/livrée/);
  });

  it("SHOP-002 — une taille est exigée, et seule une taille proposée est acceptée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const productId = await createProduct(admin, {
      priceUno: 100,
      sizeKind: "clothing",
      sizes: ["M", "L"],
    });

    // Sans taille : refus, aucun débit.
    const before = await balanceOf(buyer.identity.playerId);
    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/Choisissez une taille/);

    // Taille inventée par un client modifié : refus également.
    await expect(
      buyer.caller.shop.purchase({
        items: [{ shopItemId: productId, quantity: 1, size: "XXL" }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/n'est pas proposée/);

    expect(await balanceOf(buyer.identity.playerId)).toBe(before);

    const { order } = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1, size: "L" }],
      idempotencyKey: randomUUID(),
    });
    expect(order.items[0]?.size).toBe("L");
  });

  it("SHOP-002 — un joueur n'a qu'un avis par produit, et la note moyenne suit", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const other = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 100 });

    await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    await buyer.caller.shop.reviewProduct({
      shopItemId: productId,
      rating: 2,
      comment: "Bof.",
    });
    // Publier de nouveau remplace l'avis : pas de bourrage d'urnes.
    await buyer.caller.shop.reviewProduct({
      shopItemId: productId,
      rating: 4,
      comment: "En fait, très bien.",
    });
    await other.caller.shop.reviewProduct({ shopItemId: productId, rating: 5 });

    const reviews = await buyer.caller.shop.reviews({ shopItemId: productId });
    expect(reviews).toHaveLength(2);

    // L'achat vérifié n'est pas déclaratif : seul l'acheteur le porte.
    const mine = reviews.find((review) => review.mine);
    expect(mine?.rating).toBe(4);
    expect(mine?.verifiedPurchase).toBe(true);
    expect(reviews.find((review) => !review.mine)?.verifiedPurchase).toBe(false);

    const item = await buyer.caller.shop.item({ shopItemId: productId });
    expect(item.ratingCount).toBe(2);
    expect(item.ratingAverage).toBe(4.5);
  });

  it("SHOP-001 — la recherche filtre le catalogue côté serveur", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();
    await createProduct(admin, { name: "Maillot officiel" });
    await createProduct(admin, { name: "Gourde isotherme" });

    const found = await player.caller.shop.items({
      category: "all",
      query: "maillot",
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe("Maillot officiel");

    // Les jokers SQL sont échappés : ils ne ramènent pas tout le catalogue.
    expect(
      await player.caller.shop.items({ category: "all", query: "%" }),
    ).toHaveLength(0);
  });

  /**
   * WAL-004 — chaque écriture renvoie à ce qu'elle concerne.
   *
   * Le lien est résolu par le serveur, qui seul connaît la chaîne : un frais
   * de session référence un *paiement*, lequel référence la *proposition*. Le
   * client ne peut pas la reconstituer.
   */
  it("WAL-004 — une écriture mène à la session, la commande ou le joueur", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const buyer = await createPlayer();
    const friend = await createPlayer();
    const productId = await createProduct(admin, { priceUno: 120 });

    const { order } = await buyer.caller.shop.purchase({
      items: [{ shopItemId: productId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    await buyer.caller.wallet.send({
      toPlayerId: friend.identity.playerId,
      amount: 50,
      idempotencyKey: randomUUID(),
    });

    const page = await buyer.caller.wallet.transactions({ limit: 20 });
    const byType = new Map(page.items.map((row) => [row.type, row]));

    // L'achat ouvre la commande.
    expect(byType.get("purchase")?.link).toEqual({
      kind: "order",
      id: order.id,
      label: "Voir la commande",
    });

    // L'envoi ouvre la fiche du destinataire, et le nomme.
    const sent = byType.get("send");
    expect(sent?.link?.kind).toBe("player");
    expect(sent?.link?.id).toBe(friend.identity.playerId);
    expect(sent?.counterpartyName).toBe(sent?.link?.label);

    // Le bonus de bienvenue ne mène nulle part : rendre une ligne cliquable
    // sans destination serait une promesse rompue.
    expect(byType.get("signup_bonus")?.link).toBeNull();

    // Le destinataire voit la réciproque, nommée elle aussi.
    const received = await friend.caller.wallet.transactions({ limit: 20 });
    const credit = received.items.find((row) => row.type === "receive");
    expect(credit?.link?.kind).toBe("player");
    expect(credit?.link?.id).toBe(buyer.identity.playerId);
  });
});
