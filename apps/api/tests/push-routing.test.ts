import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Le choix de la route pour un jeton d'application (ANN-007).
 *
 * Un jeton natif enregistré depuis un iPhone est un jeton Apple : il part
 * chez Apple, jamais chez Firebase, qui le refuserait — et ce refus
 * ressemblerait à un jeton mort, si bien que l'appareil serait **retiré**
 * au premier envoi. C'est cette erreur que ce test interdit.
 *
 * Les deux transports sont remplacés : on vérifie l'aiguillage et le sort
 * des lignes, pas le réseau (couvert par push-apns et push-fcm).
 */

const apns = vi.hoisted(() => ({
  enabled: true,
  outcome: "sent" as "sent" | "unregistered" | "failed",
  sent: [] as string[],
}));
const fcm = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock("../src/push/apns.js", () => ({
  apnsEnabled: () => apns.enabled,
  sendToApns: async (token: string) => {
    apns.sent.push(token);
    return apns.outcome;
  },
}));

vi.mock("../src/push/fcm.js", () => ({
  fcmEnabled: () => true,
  sendToDevice: async (token: string) => {
    fcm.sent.push(token);
    return "sent";
  },
}));

const { createPlayer, resetDatabase } = await import("./helpers.js");
const { db } = await import("../src/db/client.js");
const { deviceTokens } = await import("../src/db/schema.js");
const { pushToPlayer, subscribe } =
  await import("../src/services/push.service.js");

const IPHONE = "ab".repeat(32);
const ANDROID = "jeton-firebase-android";

beforeEach(async () => {
  await resetDatabase();
  apns.enabled = true;
  apns.outcome = "sent";
  apns.sent.length = 0;
  fcm.sent.length = 0;
});

describe("aiguillage des jetons natifs (ANN-007)", () => {
  it("ANN-007 — l'iPhone part chez Apple, Android chez Firebase", async () => {
    const player = await createPlayer();
    const { playerId } = player.identity;
    await subscribe(playerId, {
      transport: "fcm",
      token: IPHONE,
      platform: "ios",
    });
    await subscribe(playerId, {
      transport: "fcm",
      token: ANDROID,
      platform: "android",
    });

    const result = await pushToPlayer(playerId, { title: "t", body: "b" });

    expect(result.sent).toBe(2);
    expect(apns.sent).toEqual([IPHONE]);
    expect(fcm.sent).toEqual([ANDROID]);
  });

  it("ANN-007 — un jeton Apple mort est retiré, pas les autres", async () => {
    const player = await createPlayer();
    const { playerId } = player.identity;
    await subscribe(playerId, {
      transport: "fcm",
      token: IPHONE,
      platform: "ios",
    });
    await subscribe(playerId, {
      transport: "fcm",
      token: ANDROID,
      platform: "android",
    });
    apns.outcome = "unregistered";

    const result = await pushToPlayer(playerId, { title: "t", body: "b" });

    expect(result.removed).toBe(1);
    const left = await db
      .select({ token: deviceTokens.pushToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.playerId, playerId));
    expect(left.map((row) => row.token)).toEqual([ANDROID]);
  });

  it("ANN-007 — sans configuration Apple, l'iPhone est ignoré mais gardé", async () => {
    const player = await createPlayer();
    const { playerId } = player.identity;
    await subscribe(playerId, {
      transport: "fcm",
      token: IPHONE,
      platform: "ios",
    });
    apns.enabled = false;

    const result = await pushToPlayer(playerId, { title: "t", body: "b" });

    // Ni Apple ni — surtout — Firebase : la ligne attend que la clé arrive.
    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(apns.sent).toEqual([]);
    expect(fcm.sent).toEqual([]);
  });
});
