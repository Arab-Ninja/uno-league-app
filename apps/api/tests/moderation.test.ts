import { beforeEach, describe, expect, it } from "vitest";
import {
  createFundedPlayer as createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Signaler, bloquer, filtrer (MOD-001).
 *
 * Ce que les stores exigent d'une application où les joueurs écrivent pour
 * les autres (App Store Review Guidelines 1.2) : un filtre sur ce qui part,
 * un signalement que l'administration traite, et un blocage qui agit tout de
 * suite pour celui qui bloque — sans rien réécrire chez les autres.
 */

/** Un club de trois : fondateur, et deux membres. */
async function club(): Promise<{
  squadId: number;
  founder: TestPlayer;
  alice: TestPlayer;
  bob: TestPlayer;
}> {
  const founder = await createPlayer({ firstName: "Fondateur" });
  const alice = await createPlayer({ firstName: "Alice" });
  const bob = await createPlayer({ firstName: "Bob" });
  const squad = await founder.caller.squads.create({ name: "Les Modérés" });

  for (const member of [alice, bob]) {
    await member.caller.squads.requestToJoin({ squadId: squad.id });
    const detail = await founder.caller.squads.detail({ squadId: squad.id });
    const request = detail.pendingRequests.find(
      (row) => row.player.id === member.identity.playerId,
    )!;
    await founder.caller.squads.decideRequest({
      requestId: request.id,
      accept: true,
    });
  }
  return { squadId: squad.id, founder, alice, bob };
}

const fil = (squadId: number) => ({ scope: "squad" as const, squadId });

async function product(admin: TestPlayer): Promise<number> {
  return admin.caller.admin.createShopItem({
    name: "Maillot de test",
    description: "Description de test",
    category: "accessories",
    priceUno: 300,
    priceEuros: null,
    productUrl: null,
    images: [],
    sizeKind: "none",
    sizes: [],
    available: true,
    stock: null,
  });
}

describe("filtre (MOD-001)", () => {
  beforeEach(resetDatabase);

  it("MOD-001 — une insulte est masquée, le reste du message passe", async () => {
    const { squadId, alice, founder } = await club();

    await alice.caller.squads.postMessage({
      thread: fil(squadId),
      body: "Quel CONNARD ce gardien, mais bien joué ce soir",
    });

    const { messages } = await founder.caller.squads.messages({
      thread: fil(squadId),
    });
    expect(messages[0]!.body).toBe(
      "Quel C****** ce gardien, mais bien joué ce soir",
    );
  });

  it("MOD-001 — un avis est filtré de la même façon", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const alice = await createPlayer();
    const shopItemId = await product(admin);

    const review = await alice.caller.shop.reviewProduct({
      shopItemId,
      rating: 2,
      comment: "Taille petite, vendeur salaud",
    });
    expect(review.comment).toBe("Taille petite, vendeur s*****");
  });
});

describe("signalement (MOD-001)", () => {
  beforeEach(resetDatabase);

  it("MOD-001 — un message signalé arrive chez l'administration, avec son extrait", async () => {
    const { squadId, alice, bob } = await club();
    const admin = await promoteToAdmin(await createPlayer());

    const posted = await bob.caller.squads.postMessage({
      thread: fil(squadId),
      body: "Message déplacé",
    });
    await alice.caller.moderation.report({
      kind: "message",
      targetId: posted.id,
      reason: "harassment",
      details: "Il insiste depuis hier",
    });
    // Le même geste répété ne remplit pas la file.
    await alice.caller.moderation.report({
      kind: "message",
      targetId: posted.id,
      reason: "harassment",
    });

    const reports = await admin.caller.moderation.reports({});
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: "message",
      reason: "harassment",
      excerpt: "Message déplacé",
      details: "Il insiste depuis hier",
      status: "open",
      reported: { playerId: bob.identity.playerId },
      reporter: { playerId: alice.identity.playerId },
    });
  });

  it("MOD-001 — retirer un contenu clôt tous les signalements qui le visent", async () => {
    const { squadId, alice, bob, founder } = await club();
    const admin = await promoteToAdmin(await createPlayer());

    const posted = await bob.caller.squads.postMessage({
      thread: fil(squadId),
      body: "Message à retirer",
    });
    for (const reporter of [alice, founder]) {
      await reporter.caller.moderation.report({
        kind: "message",
        targetId: posted.id,
        reason: "insult",
      });
    }

    const [first] = await admin.caller.moderation.reports({});
    const outcome = await admin.caller.moderation.resolve({
      reportId: first!.id,
      action: "remove",
    });
    expect(outcome.resolved).toBe(2);

    const { messages } = await founder.caller.squads.messages({
      thread: fil(squadId),
    });
    expect(messages).toHaveLength(0);
    expect(await admin.caller.moderation.reports({})).toHaveLength(0);
    expect(
      (await admin.caller.moderation.reports({ status: "removed" })).length,
    ).toBe(2);
  });

  it("MOD-001 — on ne se signale pas soi-même, et la file reste à l'administration", async () => {
    const { squadId, alice } = await club();
    const posted = await alice.caller.squads.postMessage({
      thread: fil(squadId),
      body: "Mon message",
    });

    await expect(
      alice.caller.moderation.report({
        kind: "message",
        targetId: posted.id,
        reason: "spam",
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    await expect(alice.caller.moderation.reports({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("blocage (MOD-001)", () => {
  beforeEach(resetDatabase);

  it("MOD-001 — les messages d'un joueur bloqué disparaissent pour qui bloque, pas pour les autres", async () => {
    const { squadId, alice, bob, founder } = await club();
    await bob.caller.squads.postMessage({
      thread: fil(squadId),
      body: "Salut l'équipe",
    });

    await alice.caller.moderation.block({ playerId: bob.identity.playerId });

    const forAlice = await alice.caller.squads.messages({
      thread: fil(squadId),
    });
    const forFounder = await founder.caller.squads.messages({
      thread: fil(squadId),
    });
    expect(forAlice.messages).toHaveLength(0);
    expect(forFounder.messages).toHaveLength(1);
    expect(
      (await alice.caller.moderation.blocked()).map((row) => row.playerId),
    ).toEqual([bob.identity.playerId]);

    await alice.caller.moderation.unblock({ playerId: bob.identity.playerId });
    expect(
      (await alice.caller.squads.messages({ thread: fil(squadId) })).messages,
    ).toHaveLength(1);
  });

  it("MOD-001 — l'avis d'un joueur bloqué n'est plus affiché", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const alice = await createPlayer();
    const bob = await createPlayer();
    const shopItemId = await product(admin);
    await bob.caller.shop.reviewProduct({ shopItemId, rating: 1 });

    await alice.caller.moderation.block({ playerId: bob.identity.playerId });

    expect(await alice.caller.shop.reviews({ shopItemId })).toHaveLength(0);
    expect(await admin.caller.shop.reviews({ shopItemId })).toHaveLength(1);
  });

  it("MOD-001 — un joueur bloqué ne peut plus inviter celui qui l'a bloqué", async () => {
    const alice = await createPlayer();
    const bob = await createPlayer();
    await alice.caller.moderation.block({ playerId: bob.identity.playerId });

    const { proposal } = await bob.caller.proposals.create({
      date: daysFromNow(4),
      slotStartHour: 20,
      venueId: "yc-five",
      modeId: "friendly",
    });
    const outcome = await bob.caller.proposals.invite({
      proposalId: proposal.id,
      playerIds: [alice.identity.playerId],
    });

    expect(outcome).toEqual({ invited: 0, skipped: 1 });
    expect(await alice.caller.proposals.invitations()).toHaveLength(0);
  });

  it("MOD-001 — on ne se bloque pas soi-même", async () => {
    const alice = await createPlayer();
    await expect(
      alice.caller.moderation.block({ playerId: alice.identity.playerId }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });
});

describe("déploiement avant la migration (MOD-001)", () => {
  it("MOD-001 — sans la table des blocages, on lit « personne n'est bloqué » au lieu d'échouer", async () => {
    const { blockedIds } =
      await import("../src/services/moderation.service.js");
    const absente = Object.assign(
      new Error("Table 'player_blocks' doesn't exist"),
      {
        code: "ER_NO_SUCH_TABLE",
        errno: 1146,
      },
    );
    // Un exécuteur dont la requête échoue comme sur une base non migrée.
    const executor = {
      select: () => ({
        from: () => ({ where: () => Promise.reject(absente) }),
      }),
    } as unknown as Parameters<typeof blockedIds>[0];

    expect([...(await blockedIds(executor, 1))]).toEqual([]);
  });
});
