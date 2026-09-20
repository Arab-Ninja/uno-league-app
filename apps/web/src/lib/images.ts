import { publicImageSrc } from "@uno/shared";

/**
 * Adresse d'affichage d'une image de la ligue (IMG-001).
 *
 * L'application ne connaît qu'une chose que la base ignore : l'origine par
 * laquelle on la regarde. C'est donc ici que le chemin d'un fichier devient
 * une adresse — et nulle part ailleurs.
 *
 * `VITE_API_URL` n'est renseignée qu'en production, quand l'API vit sur un
 * autre domaine que le site. En développement elle est vide : le serveur
 * relaie `/uploads`, et le chemin se résout contre l'origine courante, que ce
 * soit `localhost` sur le PC ou l'adresse du Wi-Fi sur le téléphone.
 */
const apiBase = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export function imageSrc(
  stored: string | null | undefined,
): string | undefined {
  return publicImageSrc(stored, apiBase);
}
