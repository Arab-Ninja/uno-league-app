/**
 * Abonnement aux notifications push, côté navigateur (ANN-004).
 *
 * Trois conditions doivent être réunies, et l'utilisateur mérite de savoir
 * laquelle manque :
 *
 *  1. le navigateur sait faire (service workers + Push API) ;
 *  2. le serveur a des clés VAPID ;
 *  3. l'utilisateur a donné sa permission.
 *
 * Sur iPhone s'ajoute une contrainte d'Apple : le push web n'existe que pour
 * une application **ajoutée à l'écran d'accueil**, depuis iOS 16.4. Tant
 * qu'elle est ouverte dans Safari, l'API est absente — le dire vaut mieux que
 * d'afficher un bouton qui ne fera rien.
 */

export type PushAvailability =
  | "ready"
  | "unsupported"
  | "needs-install"
  | "denied"
  | "not-configured";

/** Vrai si la page tourne comme application installée (PWA ou Capacitor). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS expose ce drapeau non standard.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
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

export function pushAvailability(publicKey: string | null): PushAvailability {
  if (!publicKey) return "not-configured";

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

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  platform: "ios" | "android" | "web";
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
  publicKey: string,
): Promise<PushSubscriptionPayload | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const worker = await registration();
  const subscription = await worker.pushManager.subscribe({
    // Exigé par tous les navigateurs : une notification push doit être
    // visible par l'utilisateur, on ne peut pas s'en servir en silence.
    userVisibleOnly: true,
    applicationServerKey: decodeKey(publicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    platform: platform(),
  };
}

/** Se désabonne côté navigateur et renvoie l'endpoint à retirer côté serveur. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const worker = await navigator.serviceWorker.getRegistration("/");
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) return null;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/** Endpoint de l'abonnement en cours, s'il existe sur cet appareil. */
export async function currentEndpoint(): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const worker = await navigator.serviceWorker.getRegistration("/");
  const subscription = await worker?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}
