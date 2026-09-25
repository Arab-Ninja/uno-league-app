import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

/**
 * Partager un lien : la feuille de partage du téléphone, sinon celle du
 * navigateur, sinon le presse-papiers.
 *
 * Trois étages parce qu'aucun n'est garanti :
 * - le module natif n'existe que dans les binaires publiés **après** son
 *   ajout — une mise à jour à chaud (Capgo) peut tourner sur un binaire plus
 *   ancien, d'où la vérification `isPluginAvailable` ;
 * - la WebView Android n'offre pas `navigator.share` ;
 * - le presse-papiers, lui, marche partout où la page est sécurisée.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareLink(content: {
  title: string;
  text: string;
  url: string | null;
}): Promise<ShareOutcome> {
  const { title, text, url } = content;

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Share")) {
    try {
      await Share.share({
        title,
        text,
        ...(url ? { url } : {}),
        dialogTitle: title,
      });
      return "shared";
    } catch (error) {
      // Fermer la feuille sans choisir lève une erreur : ce n'en est pas une.
      if (/cancel/i.test(String((error as Error)?.message ?? error))) {
        return "cancelled";
      }
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, ...(url ? { url } : {}) });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return "copied";
  } catch {
    return "failed";
  }
}
