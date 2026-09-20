import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Envoi par Firebase Cloud Messaging (ANN-005).
 *
 * **Ce que ces tests peuvent prouver, et ce qu'ils ne peuvent pas.** Ils ne
 * joignent aucun serveur de Google : ils remplacent `fetch` et vérifient ce
 * qu'on lui remet. C'est la partie où une erreur serait silencieuse — un JWT
 * mal signé, un jeton mort gardé pour toujours, un envoi qui remonte une
 * exception jusqu'à l'action qu'il annonçait.
 *
 * Ce qu'ils ne prouvent pas : qu'une notification arrive vraiment sur un
 * téléphone. Cela demande un projet Firebase et un appareil, et se vérifie à
 * la main.
 */

// Une vraie paire RSA : la signature doit être vérifiable, pas seulement
// présente. Signer avec une fausse clé passerait tous les tests et rien en
// production.
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const CREDENTIALS = {
  FCM_PROJECT_ID: "uno-league-test",
  FCM_CLIENT_EMAIL: "envoi@uno-league-test.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: privateKey,
};

/** Recharge le module avec l'environnement voulu : `env` est figé à l'import. */
async function loadFcm(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...CREDENTIALS, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../src/push/fcm.js");
}

/** Remplace `fetch` : le jeton OAuth d'abord, puis la réponse de FCM. */
function stubFetch(send: { status: number; body?: string }) {
  const calls: { url: string; init: RequestInit }[] = [];

  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });

    if (String(url).includes("oauth2")) {
      return new Response(
        JSON.stringify({ access_token: "jeton-acces", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(send.body ?? "", { status: send.status });
  });

  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  for (const key of Object.keys(CREDENTIALS)) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(CREDENTIALS)) delete process.env[key];
});

describe("identifiants Firebase (ANN-005)", () => {
  it("ANN-005 — sans les trois valeurs, la route est fermée", async () => {
    const fcm = await loadFcm({
      FCM_PROJECT_ID: undefined,
      FCM_CLIENT_EMAIL: undefined,
      FCM_PRIVATE_KEY: undefined,
    });

    // Une ligue qui ne publie pas d'application n'a rien à configurer chez
    // Google : l'absence n'est pas une panne.
    expect(fcm.fcmEnabled()).toBe(false);
    expect(fcm.fcmCredentials()).toBeNull();
  });

  it("ANN-005 — les sauts de ligne échappés de la clé PEM sont rétablis", async () => {
    /*
     * Le cas qui coûte une soirée. Les consoles d'hébergement n'acceptent pas
     * de vraie nouvelle ligne dans une variable : la clé arrive avec des `\n`
     * littéraux, et `createSign` la refuse en parlant de format PEM invalide.
     * On cherche alors du côté de la clé, qui est pourtant la bonne.
     */
    const escaped = privateKey.replace(/\n/g, "\\n");
    const fcm = await loadFcm({ FCM_PRIVATE_KEY: escaped });

    expect(fcm.fcmCredentials()?.privateKey).toBe(privateKey);
    expect(fcm.fcmCredentials()?.privateKey).toContain("\n");
  });
});

describe("envoi à un appareil (ANN-005)", () => {
  it("ANN-005 — le JWT est signé par la clé du compte de service", async () => {
    const fcm = await loadFcm();
    const calls = stubFetch({ status: 200 });

    expect(
      await fcm.sendToDevice("jeton-appareil", { title: "T", body: "B" }),
    ).toBe("sent");

    const oauth = calls.find((call) => call.url.includes("oauth2"))!;
    const assertion = new URLSearchParams(oauth.init.body as string).get(
      "assertion",
    )!;
    const [header, claims, signature] = assertion.split(".");

    // La signature doit tenir devant la clé publique correspondante : c'est
    // le seul contrôle qui distingue un JWT valide d'une chaîne bien formée.
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(
      verifier.verify(publicKey, Buffer.from(signature!, "base64url")),
    ).toBe(true);

    const decoded = JSON.parse(
      Buffer.from(claims!, "base64url").toString("utf8"),
    ) as { iss: string; scope: string; aud: string; exp: number; iat: number };

    expect(decoded.iss).toBe(CREDENTIALS.FCM_CLIENT_EMAIL);
    expect(decoded.scope).toContain("firebase.messaging");
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it("ANN-005 — le message part vers le bon projet, avec son titre et son lien", async () => {
    const fcm = await loadFcm();
    const calls = stubFetch({ status: 200 });

    await fcm.sendToDevice("jeton-appareil", {
      title: "Séance confirmée",
      body: "Vendredi 20h à l'Arena",
      url: "/calendrier/12",
      tag: "proposal:12",
    });

    const send = calls.find((call) => call.url.includes("fcm.googleapis.com"))!;
    expect(send.url).toContain(
      `projects/${CREDENTIALS.FCM_PROJECT_ID}/messages:send`,
    );

    const payload = JSON.parse(send.init.body as string) as {
      message: {
        token: string;
        notification: { title: string; body: string };
        data: { url: string };
        android: { notification: { tag?: string } };
        apns: { payload: { aps: Record<string, unknown> } };
      };
    };

    expect(payload.message.token).toBe("jeton-appareil");
    expect(payload.message.notification.title).toBe("Séance confirmée");

    // L'adresse voyage dans `data` : c'est le seul canal par lequel les deux
    // systèmes la remettent à l'application au clic.
    expect(payload.message.data.url).toBe("/calendrier/12");

    // Le regroupement évite qu'un même sujet empile trois notifications.
    expect(payload.message.android.notification.tag).toBe("proposal:12");
    expect(payload.message.apns.payload.aps["thread-id"]).toBe("proposal:12");
  });

  it("ANN-005 — un jeton mort est signalé comme tel, pas comme une panne", async () => {
    /*
     * La distinction commande ce que fait l'appelant : un jeton mort — appli
     * désinstallée — doit disparaître de la base, une panne passagère ne doit
     * surtout pas détruire l'abonnement d'un joueur parce que le réseau a
     * hoqueté.
     */
    for (const status of [404, 403]) {
      const fcm = await loadFcm();
      stubFetch({ status });
      expect(await fcm.sendToDevice("mort", { title: "T", body: "B" })).toBe(
        "unregistered",
      );
    }

    const fcm = await loadFcm();
    stubFetch({ status: 400, body: '{"error":{"status":"UNREGISTERED"}}' });
    expect(await fcm.sendToDevice("mort", { title: "T", body: "B" })).toBe(
      "unregistered",
    );
  });

  it("ANN-005 — une panne passagère ne détruit pas l'abonnement", async () => {
    const fcm = await loadFcm();
    stubFetch({ status: 503, body: "service indisponible" });

    expect(await fcm.sendToDevice("vivant", { title: "T", body: "B" })).toBe(
      "failed",
    );
  });

  it("ANN-005 — un jeton d'accès refusé est oublié, pas réutilisé en boucle", async () => {
    const fcm = await loadFcm();
    stubFetch({ status: 401 });

    expect(await fcm.sendToDevice("appareil", { title: "T", body: "B" })).toBe(
      "failed",
    );

    // Le suivant doit redemander un jeton : garder celui que Google vient de
    // refuser condamnerait tous les envois suivants.
    const calls = stubFetch({ status: 200 });
    expect(await fcm.sendToDevice("appareil", { title: "T", body: "B" })).toBe(
      "sent",
    );
    expect(calls.some((call) => call.url.includes("oauth2"))).toBe(true);
  });

  it("ANN-005 — le jeton d'accès est réutilisé tant qu'il est valide", async () => {
    // Un aller-retour OAuth à chaque notification doublerait le coût d'un
    // envoi, pour une valeur qui vaut une heure.
    const fcm = await loadFcm();
    const calls = stubFetch({ status: 200 });

    await fcm.sendToDevice("a", { title: "T", body: "B" });
    await fcm.sendToDevice("b", { title: "T", body: "B" });
    await fcm.sendToDevice("c", { title: "T", body: "B" });

    expect(calls.filter((call) => call.url.includes("oauth2"))).toHaveLength(1);
    expect(
      calls.filter((call) => call.url.includes("fcm.googleapis")),
    ).toHaveLength(3);
  });

  it("ANN-005 — un réseau coupé ne lève pas : être prévenu reste un plus", async () => {
    /*
     * Le principe qui gouverne tout le push : il ne doit jamais faire échouer
     * ce qu'il annonce. Recevoir sa place compte, être prévenu est un
     * supplément — une exception remontée ici ferait échouer un paiement
     * parce qu'une notification n'est pas partie.
     */
    const fcm = await loadFcm();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(
      fcm.sendToDevice("appareil", { title: "T", body: "B" }),
    ).resolves.toBe("failed");
  });
});
