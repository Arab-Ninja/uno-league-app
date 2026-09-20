import { createSign } from "node:crypto";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";

/**
 * Envoi par Firebase Cloud Messaging (ANN-005).
 *
 * **Pourquoi ce fichier existe.** Le Web Push est un standard qui ne demande
 * aucun compte : le serveur dépose lui-même le message chez le service du
 * navigateur. Mais il n'existe que *dans* un navigateur. Ni la WebView
 * Android ni WKWebView n'exposent `PushManager`, si bien qu'une application
 * installée depuis un store ne recevait jamais rien — alors que le même
 * joueur, ouvrant le site, recevait tout. Firebase est la seule route vers
 * une application empaquetée.
 *
 * **Pourquoi sans `firebase-admin`.** La bibliothèque officielle pèse une
 * cinquantaine de mégaoctets, tire des dizaines de dépendances, et est écrite
 * en CommonJS — or l'API est empaquetée en ESM, et un module CommonJS
 * embarqué produit au démarrage un `Dynamic require of "crypto" is not
 * supported` qui a déjà coûté un déploiement ici. Tout ce dont on a besoin
 * tient en deux appels HTTP et une signature RSA que `node:crypto` sait
 * faire.
 *
 * Le protocole se résume à ceci : signer un jeton JWT avec la clé privée du
 * compte de service, l'échanger contre un jeton d'accès OAuth valable une
 * heure, puis poster le message. Le jeton d'accès est gardé en mémoire — le
 * redemander à chaque notification ajouterait un aller-retour réseau à chaque
 * envoi, pour rien.
 */

const OAUTH_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** Marge avant expiration : un jeton qui expire en vol ferait échouer l'envoi. */
const REFRESH_MARGIN_MS = 60_000;

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Les identifiants, ou `null` si Firebase n'est pas configuré.
 *
 * L'absence n'est pas une erreur : une ligue qui ne publie pas d'application
 * mobile n'a rien à configurer chez Google, et le Web Push lui suffit.
 */
export function fcmCredentials(): FcmCredentials | null {
  const { FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY } = env;
  if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) return null;

  return {
    projectId: FCM_PROJECT_ID,
    clientEmail: FCM_CLIENT_EMAIL,
    /*
     * Les sauts de ligne de la clé PEM ne survivent pas à une variable
     * d'environnement : les consoles d'hébergement les écrivent `\n` littéral.
     * Sans cette réécriture, `createSign` refuse la clé avec un message qui
     * parle de format PEM invalide, et l'on cherche du côté de la clé plutôt
     * que du côté du transport.
     */
    privateKey: FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

export function fcmEnabled(): boolean {
  return fcmCredentials() !== null;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Le JWT que Google échange contre un jeton d'accès. */
function assertion(credentials: FcmCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: SCOPE,
      aud: OAUTH_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64Url(signer.sign(credentials.privateKey));

  return `${header}.${claims}.${signature}`;
}

let cached: { token: string; expiresAt: number } | null = null;

/** Jeton d'accès OAuth, renouvelé seulement quand il approche de sa fin. */
async function accessToken(credentials: FcmCredentials): Promise<string> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const response = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(credentials),
    }),
  });

  if (!response.ok) {
    // Le corps de la réponse peut contenir des éléments du compte de
    // service : on ne journalise que le statut (SEC-007).
    throw new Error(`échange de jeton Firebase refusé (${response.status})`);
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cached = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cached.token;
}

/** Ce qu'un envoi apprend sur le jeton visé. */
export type FcmOutcome = "sent" | "unregistered" | "failed";

export interface FcmMessage {
  title: string;
  body: string;
  url?: string | undefined;
  tag?: string | undefined;
}

/**
 * Dépose une notification pour un appareil.
 *
 * Ne lève jamais : être prévenu est un plus, la panne d'un envoi ne doit pas
 * remonter jusqu'à l'action qu'il annonce. Le retour distingue le jeton
 * **mort** — l'application a été désinstallée, la ligne doit disparaître — de
 * la panne passagère, qu'on se contente de journaliser.
 */
export async function sendToDevice(
  token: string,
  message: FcmMessage,
): Promise<FcmOutcome> {
  const credentials = fcmCredentials();
  if (!credentials) return "failed";

  let bearer: string;
  try {
    bearer = await accessToken(credentials);
  } catch (error) {
    logger.warn(
      { error: String(error) },
      "jeton d'accès Firebase indisponible",
    );
    return "failed";
  }

  /*
   * La charge utile mérite un mot.
   *
   * `notification` est ce qu'Android et iOS affichent seuls, application
   * fermée — c'est le cas courant, et celui qui compte : un rappel de
   * paiement n'a d'intérêt que si le joueur n'est pas déjà devant l'écran.
   *
   * `data` porte l'adresse à ouvrir au clic. Elle est dupliquée hors de
   * `notification` parce que les deux systèmes ne la remettent à
   * l'application que par ce canal.
   *
   * `tag` regroupe : une seconde notification du même sujet remplace la
   * première au lieu de s'empiler. Android l'appelle `tag`, Apple
   * `thread-id`.
   */
  const payload = {
    message: {
      token,
      notification: { title: message.title, body: message.body },
      data: { url: message.url ?? "/" },
      android: {
        priority: "HIGH",
        notification: {
          ...(message.tag ? { tag: message.tag } : {}),
          // L'icône et la couleur viennent des ressources de l'application ;
          // sans cela Android affiche un carré gris.
          icon: "ic_launcher",
          color: "#F97316",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            ...(message.tag ? { "thread-id": message.tag } : {}),
          },
        },
      },
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${credentials.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    logger.warn({ error: String(error) }, "envoi Firebase injoignable");
    return "failed";
  }

  if (response.ok) return "sent";

  /*
   * 404 et 403 signalent un jeton qui n'a plus de destinataire : application
   * désinstallée, ou jeton renouvelé par le système. C'est définitif, la
   * ligne doit partir — sans quoi la table grossit indéfiniment et chaque
   * envoi traîne des destinataires fantômes.
   *
   * Le 401 est à part : c'est notre jeton d'accès qui est en cause, pas
   * l'appareil. On l'oublie pour que le prochain envoi en redemande un.
   */
  if (response.status === 401) {
    cached = null;
    logger.warn(
      "jeton d'accès Firebase refusé : renouvellement au prochain envoi",
    );
    return "failed";
  }

  if (response.status === 404 || response.status === 403) return "unregistered";

  const detail = await response.text().catch(() => "");
  // `UNREGISTERED` arrive aussi en 400 lorsque le jeton est mal formé côté
  // client : le corps le dit, le statut non.
  if (detail.includes("UNREGISTERED") || detail.includes("INVALID_ARGUMENT")) {
    return "unregistered";
  }

  logger.warn({ status: response.status }, "envoi Firebase en échec");
  return "failed";
}

/** Remet le jeton d'accès à zéro. Réservé aux tests. */
export function resetAccessTokenCache(): void {
  cached = null;
}
