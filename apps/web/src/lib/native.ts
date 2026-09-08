import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ImpactStyle, Haptics } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Couche d'adaptation entre le navigateur et l'application empaquetée.
 *
 * Chaque appel natif est protégé : le même code tourne sur le web, où les
 * greffons Capacitor sont absents, sans jamais lever d'exception.
 */

export const isNative = Capacitor.isNativePlatform();

/** Retour haptique sur les actions principales (UX §16). */
export async function tapFeedback(
  intensity: "light" | "medium" | "heavy" = "light",
): Promise<void> {
  if (!isNative) return;
  try {
    const style =
      intensity === "heavy"
        ? ImpactStyle.Heavy
        : intensity === "medium"
          ? ImpactStyle.Medium
          : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {
    // Un appareil sans moteur haptique ne doit pas interrompre l'action.
  }
}

export async function notificationFeedback(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification();
  } catch {
    /* sans effet sur le web */
  }
}

const TOKEN_KEY = "uno_session_token";

/**
 * Stockage du jeton de session.
 *
 * Sur le web, le jeton n'est pas conservé côté client : c'est le cookie
 * httpOnly posé par le serveur qui porte la session, hors de portée du
 * JavaScript (SEC-001).
 *
 * Dans l'application empaquetée, les cookies de WebView ne sont pas fiables :
 * le jeton est alors conservé par Capacitor Preferences (Keychain sur iOS,
 * stockage privé de l'application sur Android) et envoyé en en-tête.
 * Aucun mot de passe n'est stocké dans aucun des deux cas.
 */
export const sessionStore = {
  async get(): Promise<string | null> {
    if (!isNative) return null;
    try {
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      return value ?? null;
    } catch {
      return null;
    }
  },

  async set(token: string): Promise<void> {
    if (!isNative) return;
    try {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } catch {
      /* ignoré : la session reste valable pour la durée d'exécution */
    }
  },

  async clear(): Promise<void> {
    if (!isNative) return;
    try {
      await Preferences.remove({ key: TOKEN_KEY });
    } catch {
      /* ignoré */
    }
  },
};

/** Aligne la barre d'état système sur le thème sombre de l'application. */
export async function applyNativeChrome(): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0F172A" });
  } catch {
    /* iOS refuse setBackgroundColor : sans conséquence */
  }
}

/** Branche le bouton retour matériel d'Android sur l'historique de navigation. */
export function bindHardwareBackButton(onBack: () => boolean): () => void {
  if (!isNative) return () => undefined;

  const handle = App.addListener("backButton", () => {
    // `onBack` renvoie false lorsqu'il n'y a plus rien à dépiler : on quitte.
    if (!onBack()) void App.exitApp();
  });

  return () => {
    void handle.then((listener) => listener.remove());
  };
}

/**
 * Confirme au module de mise à jour que l'application a démarré correctement
 * (Capgo).
 *
 * **Cet appel est le filet de sécurité du mécanisme.** Le plugin attend ce
 * signal après avoir appliqué une nouvelle version ; s'il ne vient pas dans
 * le délai imparti, il considère la version défaillante et revient
 * automatiquement à la précédente. Sans lui, une mise à jour qui plante au
 * démarrage rendrait l'application inutilisable jusqu'à une republication sur
 * les stores — exactement ce que le mécanisme cherche à éviter.
 *
 * À appeler une fois l'interface montée, pas avant : le but est d'attester
 * que l'application est réellement utilisable.
 */
export async function confirmAppReady(): Promise<void> {
  if (!isNative) return;

  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // Plugin absent — build web, ou version native antérieure. Sans
    // conséquence : il n'y a alors pas de mise à jour à confirmer.
  }
}

