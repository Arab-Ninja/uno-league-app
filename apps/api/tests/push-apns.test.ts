import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApnsRequester, ApnsResponse } from "../src/push/apns.js";

/**
 * Envoi direct à Apple pour l'application iPhone (ANN-007).
 *
 * Comme pour Firebase, ces tests ne joignent pas Apple : ils remplacent la
 * couche HTTP/2 et vérifient ce qu'on lui remet — un JWT qu'Apple saurait
 * vérifier, le bon serveur, le bon sujet, et le sort réservé à chaque
 * réponse. Qu'une notification arrive sur un iPhone se vérifie à la main,
 * depuis TestFlight.
 */

// Une vraie clé P-256, comme celle d'un fichier `.p8` : la signature doit
// être vérifiable, pas seulement présente.
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const CREDENTIALS = {
  APNS_KEY_ID: "ABC123DEFG",
  APNS_TEAM_ID: "TEAM123456",
  APNS_PRIVATE_KEY: privateKey,
};
const OTHER_KEYS = ["APNS_SANDBOX", "APNS_BUNDLE_ID"] as const;

const TOKEN = "a1".repeat(32);

async function loadApns(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...CREDENTIALS, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../src/push/apns.js");
}

interface Call {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

function recorder(response: ApnsResponse | Error) {
  const calls: Call[] = [];
  const requester: ApnsRequester = async (host, path, headers, body) => {
    calls.push({ host, path, headers, body });
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, requester };
}

function clearEnv() {
  for (const key of [...Object.keys(CREDENTIALS), ...OTHER_KEYS]) {
    delete process.env[key];
  }
}

beforeEach(clearEnv);
afterEach(clearEnv);

describe("identifiants Apple (ANN-007)", () => {
  it("ANN-007 — avec les trois valeurs la route s'ouvre, sans elles elle est fermée", async () => {
    expect((await loadApns()).apnsEnabled()).toBe(true);

    const empty = await loadApns({
      APNS_KEY_ID: undefined,
      APNS_TEAM_ID: undefined,
      APNS_PRIVATE_KEY: undefined,
    });
    // Une ligue sans application iPhone n'a rien à configurer chez Apple.
    expect(empty.apnsEnabled()).toBe(false);
    expect(empty.apnsCredentials()).toBeNull();
  });

  it("ANN-007 — production par défaut, bac à sable sur demande", async () => {
    const production = await loadApns();
    expect(production.apnsCredentials()?.host).toBe(
      "https://api.push.apple.com",
    );
    expect(production.apnsCredentials()?.bundleId).toBe("app.unoleague.mobile");

    const sandbox = await loadApns({ APNS_SANDBOX: "true" });
    expect(sandbox.apnsCredentials()?.host).toBe(
      "https://api.sandbox.push.apple.com",
    );
  });

  it("ANN-007 — une configuration partielle est refusée au démarrage", async () => {
    // Deux valeurs sur trois : l'iPhone ne recevrait rien, en silence.
    const { envSchema } = await import("../src/env.js");
    const result = envSchema.safeParse({
      DATABASE_URL: "mysql://uno:secret@127.0.0.1:3306/uno_league",
      SESSION_SECRET: "x".repeat(32),
      APNS_KEY_ID: CREDENTIALS.APNS_KEY_ID,
      APNS_TEAM_ID: CREDENTIALS.APNS_TEAM_ID,
    });
    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.path[0]),
    ).toEqual(["APNS_PRIVATE_KEY"]);
  });
});

describe("envoi à un iPhone (ANN-007)", () => {
  it("ANN-007 — le JWT est signé ES256 par la clé .p8 et nomme l'équipe", async () => {
    const apns = await loadApns();
    const { calls, requester } = recorder({ status: 200 });
    apns.setApnsRequesterForTests(requester);

    await apns.sendToApns(TOKEN, { title: "Titre", body: "Corps" });

    const bearer = calls[0]!.headers["authorization"]!.replace(/^bearer /, "");
    const [header, claims, signature] = bearer.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG",
    });
    expect(
      JSON.parse(Buffer.from(claims!, "base64url").toString()),
    ).toMatchObject({ iss: "TEAM123456" });

    // Signature brute r ‖ s de 64 octets, vérifiable avec la clé publique.
    const raw = Buffer.from(signature!, "base64url");
    expect(raw).toHaveLength(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        raw,
      ),
    ).toBe(true);
  });

  it("ANN-007 — le message vise l'appareil, l'application, et porte son lien", async () => {
    const apns = await loadApns();
    const { calls, requester } = recorder({ status: 200 });
    apns.setApnsRequesterForTests(requester);

    const outcome = await apns.sendToApns(TOKEN, {
      title: "Place libérée",
      body: "Une place s'est libérée jeudi.",
      url: "/sessions/12",
      tag: "proposal:12",
    });

    expect(outcome).toBe("sent");
    const call = calls[0]!;
    expect(call.host).toBe("https://api.push.apple.com");
    expect(call.path).toBe(`/3/device/${TOKEN}`);
    expect(call.headers).toMatchObject({
      "apns-topic": "app.unoleague.mobile",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": "proposal:12",
    });
    expect(JSON.parse(call.body)).toEqual({
      aps: {
        alert: {
          title: "Place libérée",
          body: "Une place s'est libérée jeudi.",
        },
        sound: "default",
        "thread-id": "proposal:12",
      },
      url: "/sessions/12",
    });
  });

  it("ANN-007 — le JWT est réutilisé d'un envoi à l'autre", async () => {
    const apns = await loadApns();
    const { calls, requester } = recorder({ status: 200 });
    apns.setApnsRequesterForTests(requester);

    await apns.sendToApns(TOKEN, { title: "1", body: "1" });
    await apns.sendToApns(TOKEN, { title: "2", body: "2" });

    expect(calls[0]!.headers["authorization"]).toBe(
      calls[1]!.headers["authorization"],
    );
  });

  it("ANN-007 — un jeton mort est signalé comme tel, pas comme une panne", async () => {
    for (const response of [
      { status: 410, reason: "Unregistered" },
      { status: 400, reason: "BadDeviceToken" },
      { status: 400, reason: "DeviceTokenNotForTopic" },
    ]) {
      const apns = await loadApns();
      apns.setApnsRequesterForTests(recorder(response).requester);
      expect(await apns.sendToApns(TOKEN, { title: "t", body: "b" })).toBe(
        "unregistered",
      );
    }
  });

  it("ANN-007 — une panne passagère ne détruit pas l'abonnement", async () => {
    for (const response of [
      { status: 429, reason: "TooManyRequests" },
      { status: 503, reason: "ServiceUnavailable" },
      { status: 400, reason: "PayloadTooLarge" },
      new Error("connexion coupée"),
    ]) {
      const apns = await loadApns();
      apns.setApnsRequesterForTests(recorder(response).requester);
      expect(await apns.sendToApns(TOKEN, { title: "t", body: "b" })).toBe(
        "failed",
      );
    }
  });

  it("ANN-007 — un JWT refusé est refait au prochain envoi", async () => {
    const apns = await loadApns();
    const refused = recorder({ status: 403, reason: "ExpiredProviderToken" });
    apns.setApnsRequesterForTests(refused.requester);
    expect(await apns.sendToApns(TOKEN, { title: "t", body: "b" })).toBe(
      "failed",
    );

    // Une seconde plus tard, le nouveau JWT porte un autre `iat`.
    vi.useFakeTimers({ now: Date.now() + 1_000 });
    try {
      const accepted = recorder({ status: 200 });
      apns.setApnsRequesterForTests(accepted.requester);
      await apns.sendToApns(TOKEN, { title: "t", body: "b" });
      expect(accepted.calls[0]!.headers["authorization"]).not.toBe(
        refused.calls[0]!.headers["authorization"],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("ANN-007 — un jeton qui n'est pas hexadécimal n'atteint jamais le réseau", async () => {
    const apns = await loadApns();
    const { calls, requester } = recorder({ status: 200 });
    apns.setApnsRequesterForTests(requester);

    expect(
      await apns.sendToApns("../../3/device/x?y", { title: "t", body: "b" }),
    ).toBe("unregistered");
    expect(calls).toHaveLength(0);
  });

  it("ANN-007 — sans configuration, rien ne part et rien ne lève", async () => {
    const apns = await loadApns({
      APNS_KEY_ID: undefined,
      APNS_TEAM_ID: undefined,
      APNS_PRIVATE_KEY: undefined,
    });
    const { calls, requester } = recorder({ status: 200 });
    apns.setApnsRequesterForTests(requester);

    expect(await apns.sendToApns(TOKEN, { title: "t", body: "b" })).toBe(
      "failed",
    );
    expect(calls).toHaveLength(0);
  });
});
