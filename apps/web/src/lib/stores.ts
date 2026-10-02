/**
 * Les fiches de l'application dans les stores.
 *
 * Une seule source pour les liens : le bouton de la page d'accueil et
 * l'adresse courte `/app` (celle qu'on met en bio Instagram ou TikTok) lisent
 * les mêmes constantes. L'App Store s'ajoute ici le jour où Apple publie
 * l'application : son lien porte un identifiant numérique qu'App Store
 * Connect affiche (« Apple ID »), pas le nom du paquet.
 */

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.unoleague.mobile";

/** `null` tant que l'application n'est pas publiée sur l'App Store. */
export const APP_STORE_URL: string | null = null;

export type DevicePlatform = "android" | "ios" | "other";

/**
 * La plateforme du visiteur, d'après son navigateur.
 *
 * Un iPad récent se présente comme un Mac : seul son écran tactile le trahit.
 * La détection n'a pas besoin d'être parfaite — elle choisit vers quel store
 * envoyer, et un visiteur mal deviné atterrit sur la page d'accueil, où les
 * deux boutons restent à portée.
 */
export function detectPlatform(
  userAgent: string = navigator.userAgent,
  maxTouchPoints: number = navigator.maxTouchPoints ?? 0,
): DevicePlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
}

/** Le store où envoyer ce visiteur, ou `null` s'il n'y en a pas pour lui. */
export function storeUrlFor(platform: DevicePlatform): string | null {
  if (platform === "android") return PLAY_STORE_URL;
  if (platform === "ios") return APP_STORE_URL;
  return null;
}
