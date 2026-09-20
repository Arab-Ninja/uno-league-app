import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { isNative } from "./native.js";
import { traduire } from "@/lib/i18n.js";

/**
 * Abonnement aux notifications push (ANN-004, ANN-005).
 *
 * **Deux routes, parce que deux mondes.**
 *
 * Dans un navigateur, le standard Web Push : le service worker s'abonne, rend
 * une URL d'endpoint et deux clés, et le serveur y dépose lui-même le message.
 * Aucun compte développeur n'est nécessaire.
 *
 * Dans l'application empaquetée, rien de tout cela n'existe : **ni la WebView
 * Android ni WKWebView n'exposent `PushManager`**. Une application installée
 * depuis un store ne recevait donc aucune notification système, alors que le
 * même joueur ouvrant le site les recevait toutes. Firebase Cloud Messaging
 * est la seule route vers un binaire, et c'est le greffon Capacitor qui la
 * prend.
 *
 * Le reste de l'application ignore laquelle est employée : ces fonctions
 * rendent un « enregistrement » dont le serveur sait quoi faire.
 *
 * Sur iPhone **hors application empaquetée** s'ajoute une contrainte d'Apple :
 * le push web n'existe que pour un site ajouté à l'écran d'accueil, depuis
 * iOS 16.4. Tant qu'il est ouvert dans Safari, l'API est absente — le dire
 * vaut mieux que d'afficher un bouton qui ne fera rien.
 */

/** La clé sous laquelle le jeton Firebase est retenu, pour pouvoir le retirer. */
const FCM_TOKEN_KEY = "uno.push.fcm";

/** Ce que le serveur attend pour joindre cet appareil. */
export type PushRegistration =
  | {
      transport: "webpush";
      endpoint: string;
      keys: { p256dh: string; auth: string };
      platform: "ios" | "android" | "web";
    }
  | {
      transport: "fcm";
      token: string;
      platform: "ios" | "android" | "web";
    };

/** Ce que le serveur sait du push : les deux routes sont indépendantes. */
export interface PushConfig {
  /** Clé VAPID, nulle si le push navigateur n'est pas configuré. */
  publicKey: string | null;
  /** Vrai si Firebase est configuré, donc si l'application native peut s'abonner. */
  nativeEnabled: boolean;
}

export type PushAvailability =
  "ready" | "unsupported" | "needs-install" | "denied" | "not-configured";

/** Vrai si la page tourne comme application installée (PWA ou Capacitor). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS expose ce drapeau non standard.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se présente comme un Mac ; l'écran tactile le trahit.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function pushAvailability(config: PushConfig): PushAvailability {
  /*
   * Dans l'application empaquetée, la question du navigateur ne se pose pas :
   * il n'y a ni service worker utile ni `PushManager`, et pourtant le push
   * fonctionne — par le greffon. Tester les API du web ici aurait conclu
   * « non pris en charge » sur le seul cas où tout est en place.
   */
  if (isNative) {
    return config.nativeEnabled ? "ready" : "not-configured";
  }

  if (!config.publicKey) return "not-configured";

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!supported) {
    // Sur iPhone hors écran d'accueil, l'API est simplement absente : ce n'est
    // pas un navigateur trop vieux, c'est une application pas encore installée.
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }

  if (Notification.permission === "denied") return "denied";
  return "ready";
}

/**
 * Convertit la clé publique VAPID au format attendu par `PushManager`.
 * Elle circule en base64url ; l'API veut un tableau d'octets.
 */
function decodeKey(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * Sur quel système tourne cet appareil.
 *
 * Exporté parce que le module d'écoute en a besoin lui aussi : quand Firebase
 * renouvelle un jeton, le nouvel enregistrement doit repartir avec la même
 * plateforme que le premier.
 */
export function devicePlatform(): "ios" | "android" | "web" {
  return platform();
}

function platform(): "ios" | "android" | "web" {
  if (isIos()) return "ios";
  if (typeof navigator !== "undefined" && /Android/.test(navigator.userAgent)) {
    return "android";
  }
  return "web";
}

/**
 * Demande la permission et abonne le navigateur.
 * Renvoie l'abonnement à transmettre au serveur, ou `null` si l'utilisateur a
 * refusé — un refus n'est pas une erreur, c'est une réponse.
 */
export async function subscribeToPush(
  config: PushConfig,
): Promise<PushRegistration | null> {
  if (isNative) return subscribeNative();
  if (!config.publicKey) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const worker = await registration();
  const subscription = await worker.pushManager.subscribe({
    // Exigé par tous les navigateurs : une notification push doit être
    // visible par l'utilisateur, on ne peut pas s'en servir en silence.
    userVisibleOnly: true,
    applicationServerKey: decodeKey(config.publicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  return {
    transport: "webpush",
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    platform: platform(),
  };
}

/**
 * Abonnement dans l'application empaquetée.
 *
 * Le greffon n'a pas d'API qui « rend » le jeton : `register()` déclenche une
 * demande auprès du système, et le jeton arrive plus tard par un évènement.
 * D'où cette promesse, qui attend l'un des deux évènements possibles —
 * `registration` ou `registrationError` — et une limite de temps.
 *
 * La limite n'est pas de la superstition : sur un appareil sans services
 * Google, ou avec un réseau coupé, aucun des deux évènements n'arrive jamais.
 * Sans elle, le bouton de l'écran resterait à tourner indéfiniment.
 */
async function subscribeNative(): Promise<PushRegistration | null> {
  const asked = await PushNotifications.requestPermissions();
  if (asked.receive !== "granted") return null;

  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    void PushNotifications.addListener("registration", (received) => {
      finish(received.value);
    });
    void PushNotifications.addListener("registrationError", () => {
      finish(null);
    });

    setTimeout(() => finish(null), 15_000);
    void PushNotifications.register();
  });

  /*
   * Ici, la permission a été **accordée** : un jeton manquant n'est donc pas
   * un refus de l'utilisateur, et le lui dire serait mentir. C'est presque
   * toujours l'application qui est mal montée — `google-services.json` absent
   * du binaire — ou un appareil sans services Google.
   *
   * L'erreur est distincte pour cette raison : l'écran affiche le message
   * d'une exception, et « les notifications ont été refusées » aurait envoyé
   * le joueur régler une permission qu'il venait d'accorder.
   */
  if (!token) {
    throw new Error(traduire("push.pushUnavailable"));
  }

  // Retenu pour pouvoir le retirer plus tard : le système ne le redonne pas
  // sur demande, et sans lui le serveur garderait un destinataire fantôme.
  try {
    await Preferences.set({ key: FCM_TOKEN_KEY, value: token });
  } catch {
    /* ignoré : l'abonnement fonctionne, seul le retrait sera moins propre */
  }

  return { transport: "fcm", token, platform: platform() };
}

/**
 * Coupe les notifications sur cet appareil et rend de quoi le retirer côté
 * serveur : son endpoint pour un navigateur, son jeton pour une application.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (isNative) {
    let token: string | null = null;
    try {
      token = (await Preferences.get({ key: FCM_TOKEN_KEY })).value ?? null;
      await Preferences.remove({ key: FCM_TOKEN_KEY });
    } catch {
      /* ignoré : on continue de désenregistrer l'appareil */
    }

    // Le système cesse d'émettre un jeton pour cette installation. Sans cela,
    // couper les notifications dans l'application les laisserait arriver.
    try {
      await PushNotifications.unregister();
    } catch {
      /* ignoré */
    }
    return token;
  }

  const worker = await navigator.serviceWorker.getRegistration("/");
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) return null;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/**
 * Le jeton Firebase retenu pour cet appareil, ou `null`.
 *
 * `currentHandle` répond la même chose sur une application empaquetée, mais
 * rend un endpoint de navigateur sur le web : les deux ne se remplacent pas.
 * Celui-ci ne parle que de Firebase, et c'est ce dont le module d'écoute a
 * besoin pour reconnaître un renouvellement.
 */
export async function storedFcmToken(): Promise<string | null> {
  try {
    return (await Preferences.get({ key: FCM_TOKEN_KEY })).value ?? null;
  } catch {
    return null;
  }
}

/** Retient le jeton courant, pour pouvoir le comparer et le retirer plus tard. */
export async function rememberFcmToken(token: string): Promise<void> {
  try {
    await Preferences.set({ key: FCM_TOKEN_KEY, value: token });
  } catch {
    /* ignoré : l'abonnement fonctionne, seul le retrait sera moins propre */
  }
}

/**
 * De quoi cet appareil est-il déjà identifié, s'il l'est ?
 *
 * Sert à l'écran de réglage pour savoir s'il doit proposer d'activer ou de
 * couper. Rend `null` quand rien n'est en place.
 */
export async function currentHandle(): Promise<string | null> {
  if (isNative) {
    try {
      return (await Preferences.get({ key: FCM_TOKEN_KEY })).value ?? null;
    } catch {
      return null;
    }
  }

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const worker = await navigator.serviceWorker.getRegistration("/");
  const subscription = await worker?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}
