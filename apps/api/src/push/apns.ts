import { connect, type ClientHttp2Session } from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";

/**
 * Envoi direct au service de notifications d'Apple (ANN-007).
 *
 * **Pourquoi ce fichier existe à côté de Firebase.** Sur Android, le greffon
 * Capacitor remet un jeton Firebase. Sur iPhone, il remet le jeton **Apple**
 * de l'appareil — une suite hexadécimale que Firebase ne sait pas adresser.
 * Passer par Firebase aurait demandé d'embarquer son SDK dans le binaire iOS
 * et de réécrire le démarrage natif de l'application ; parler à Apple
 * directement ne demande qu'une clé et une requête HTTP/2.
 *
 * Le protocole : un JWT signé ES256 avec la clé `.p8` du compte développeur,
 * présenté à chaque requête. Apple refuse qu'on le renouvelle plus d'une fois
 * toutes les vingt minutes et le rejette au-delà d'une heure : on le garde
 * cinquante minutes.
 *
 * Apple n'accepte que HTTP/2, que `fetch` ne parle pas : d'où `node:http2`,
 * et une connexion gardée ouverte entre deux envois, comme Apple le demande.
 */

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

/** Durée de vie du JWT avant renouvellement. */
const TOKEN_TTL_MS = 50 * 60_000;
/** Au-delà, la requête est abandonnée : un envoi ne doit rien bloquer. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  host: string;
}

/** Les identifiants, ou `null` si le push iPhone n'est pas configuré. */
export function apnsCredentials(): ApnsCredentials | null {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY } = env;
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) return null;

  return {
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    // Même réécriture que pour Firebase : les consoles d'hébergement
    // transmettent les sauts de ligne de la clé comme `\n` littéraux.
    privateKey: APNS_PRIVATE_KEY.replace(/\\n/g, "\n"),
    bundleId: env.APNS_BUNDLE_ID,
    host: env.APNS_SANDBOX ? SANDBOX_HOST : PRODUCTION_HOST,
  };
}

export function apnsEnabled(): boolean {
  return apnsCredentials() !== null;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let cachedKey: { pem: string; key: KeyObject } | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Le JWT présenté à Apple, renouvelé seulement quand il vieillit. */
function providerToken(credentials: ApnsCredentials): string {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  if (cachedKey?.pem !== credentials.privateKey) {
    cachedKey = {
      pem: credentials.privateKey,
      key: createPrivateKey(credentials.privateKey),
    };
  }

  const header = base64Url(
    JSON.stringify({ alg: "ES256", kid: credentials.keyId }),
  );
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.teamId,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  // Apple attend la signature ECDSA brute (r ‖ s), pas l'enveloppe DER que
  // `sign` produit par défaut : sans `ieee-p1363`, chaque envoi est refusé.
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: cachedKey.key,
    dsaEncoding: "ieee-p1363",
  });

  cachedToken = {
    value: `${header}.${claims}.${base64Url(signature)}`,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  return cachedToken.value;
}

/** La réponse d'Apple, réduite à ce qui décide du sort du jeton. */
export interface ApnsResponse {
  status: number;
  reason?: string | undefined;
}

export type ApnsRequester = (
  host: string,
  path: string,
  headers: Record<string, string>,
  body: string,
) => Promise<ApnsResponse>;

let session: { host: string; client: ClientHttp2Session } | null = null;

function openSession(host: string): ClientHttp2Session {
  if (
    session &&
    session.host === host &&
    !session.client.closed &&
    !session.client.destroyed
  ) {
    return session.client;
  }

  const client = connect(host);
  // Une connexion coupée par Apple (inactivité, GOAWAY) est simplement
  // oubliée : le prochain envoi en ouvre une autre.
  const forget = () => {
    if (session?.client === client) session = null;
  };
  client.on("error", forget);
  client.on("goaway", forget);
  client.on("close", forget);
  // Une connexion ouverte ne doit pas empêcher le processus de s'arrêter.
  client.unref();

  session = { host, client };
  return client;
}

const http2Requester: ApnsRequester = (host, path, headers, body) =>
  new Promise((resolve, reject) => {
    let request;
    try {
      request = openSession(host).request({
        ":method": "POST",
        ":path": path,
        ...headers,
      });
    } catch (error) {
      reject(error);
      return;
    }

    let status = 0;
    let data = "";
    request.setEncoding("utf8");
    request.on("response", (responseHeaders) => {
      status = Number(responseHeaders[":status"] ?? 0);
    });
    request.on("data", (chunk: string) => {
      data += chunk;
    });
    request.on("end", () => {
      let reason: string | undefined;
      try {
        reason = data
          ? (JSON.parse(data) as { reason?: string }).reason
          : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    request.on("error", reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.close();
      reject(new Error("délai dépassé"));
    });
    request.end(body);
  });

let requester: ApnsRequester = http2Requester;

/** Ce qu'un envoi apprend sur le jeton visé. */
export type ApnsOutcome = "sent" | "unregistered" | "failed";

export interface ApnsMessage {
  title: string;
  body: string;
  url?: string | undefined;
  tag?: string | undefined;
}

/** Un jeton d'appareil Apple : 32 octets, écrits en hexadécimal. */
const DEVICE_TOKEN = /^[0-9a-f]{64,200}$/i;

/** Raisons pour lesquelles Apple dit qu'un jeton ne mène plus nulle part. */
const DEAD_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
]);

/**
 * Dépose une notification sur un iPhone.
 *
 * Ne lève jamais, comme l'envoi Firebase : le retour distingue le jeton mort
 * — l'application a été désinstallée, la ligne doit disparaître — de la panne
 * passagère, seulement journalisée. Le jeton n'apparaît jamais dans le
 * journal (SEC-007).
 */
export async function sendToApns(
  token: string,
  message: ApnsMessage,
): Promise<ApnsOutcome> {
  const credentials = apnsCredentials();
  if (!credentials) return "failed";

  // Le jeton entre dans le chemin de la requête : tout ce qui n'est pas
  // hexadécimal est refusé avant d'atteindre le réseau.
  if (!DEVICE_TOKEN.test(token)) return "unregistered";

  let bearer: string;
  try {
    bearer = providerToken(credentials);
  } catch (error) {
    logger.warn({ error: String(error) }, "clé APNs illisible");
    return "failed";
  }

  /*
   * `aps` est ce qu'iOS affiche seul, application fermée. `url` est posé à
   * côté : le greffon remet tout le contenu à l'application lors d'un appui,
   * et c'est là que l'écran à ouvrir est lu — exactement comme sur Android.
   *
   * `tag` fait deux choses, comme sur Android : regrouper (`thread-id`) et
   * remplacer (`apns-collapse-id`) la notification précédente du même sujet.
   */
  const payload = {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
      ...(message.tag ? { "thread-id": message.tag } : {}),
    },
    url: message.url ?? "/",
  };

  const headers: Record<string, string> = {
    authorization: `bearer ${bearer}`,
    "apns-topic": credentials.bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
  };
  // Apple refuse un identifiant de regroupement de plus de 64 octets.
  if (message.tag && Buffer.byteLength(message.tag) <= 64) {
    headers["apns-collapse-id"] = message.tag;
  }

  let response: ApnsResponse;
  try {
    response = await requester(
      credentials.host,
      `/3/device/${token}`,
      headers,
      JSON.stringify(payload),
    );
  } catch (error) {
    logger.warn({ error: String(error) }, "envoi APNs injoignable");
    return "failed";
  }

  if (response.status === 200) return "sent";

  if (response.status === 410) return "unregistered";
  if (
    response.status === 400 &&
    DEAD_TOKEN_REASONS.has(response.reason ?? "")
  ) {
    return "unregistered";
  }

  // Notre JWT est en cause, pas l'appareil : on le refait au prochain envoi.
  if (response.status === 403) cachedToken = null;

  logger.warn(
    { status: response.status, reason: response.reason },
    "envoi APNs en échec",
  );
  return "failed";
}

/** Remplace la couche réseau. Réservé aux tests. */
export function setApnsRequesterForTests(next: ApnsRequester | null): void {
  requester = next ?? http2Requester;
}

/** Oublie le JWT et la clé en mémoire. Réservé aux tests. */
export function resetApnsCache(): void {
  cachedKey = null;
  cachedToken = null;
}
