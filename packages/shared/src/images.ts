/**
 * Adresse d'affichage d'une image stockée par la ligue (IMG-001).
 *
 * Le problème que ce fichier résout est apparu au premier essai depuis un
 * téléphone : **l'adresse du serveur était inscrite dans les données**. Une
 * photo envoyée depuis le PC était enregistrée comme
 * `http://localhost:4000/uploads/avatars/x.webp`. Vue du téléphone,
 * `localhost` désigne le téléphone : plus aucune image n'apparaissait. Vue
 * d'une page en HTTPS, une adresse en clair est bloquée de surcroît.
 *
 * Une adresse de machine n'appartient pas à la donnée. Ce qui appartient à la
 * donnée, c'est le **chemin** du fichier ; l'hôte qui le sert dépend de qui
 * regarde, et se décide donc à l'affichage.
 *
 * La règle tient en une phrase : **une image hébergée par la ligue est servie
 * par l'origine courante ; une image extérieure garde son adresse**. Les
 * anciennes lignes, qui portent encore un hôte local, sont ramenées à leur
 * chemin — sans quoi il faudrait migrer des colonnes JSON sur deux moteurs de
 * base de données pour un défaut qui se corrige ici en dix lignes.
 */

/** Hôtes qui ne désignent jamais la même machine d'un appareil à l'autre. */
function isMachineLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;

  // RFC 1918 et lien-local : l'adresse d'un appareil sur un réseau privé.
  const octets = host.split(".");
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = octets.map(Number) as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  // IPv6 de lien-local ou unique-local.
  if (/^fe[89ab]/.test(host) || /^f[cd][0-9a-f]{2}:/.test(host)) return true;

  return false;
}

/**
 * Ce qu'un `<img>` doit recevoir pour une valeur enregistrée en base.
 *
 * `apiBase` est l'adresse de l'API quand elle vit sur un autre domaine que le
 * site — le cas en production. En développement, le serveur relaie `/uploads`
 * lui-même : la chaîne vide suffit, et le navigateur résout le chemin contre
 * l'origine qu'il utilise déjà, qu'elle soit `localhost` ou l'adresse du Wi-Fi.
 */
export function publicImageSrc(
  stored: string | null | undefined,
  apiBase = "",
): string | undefined {
  if (!stored) return undefined;

  const base = apiBase.replace(/\/$/, "");
  const fromPath = (path: string) => `${base}${path}`;

  // Déjà un chemin : c'est la forme que le serveur écrit désormais.
  if (stored.startsWith("/")) return fromPath(stored);

  let url: URL;
  try {
    url = new URL(stored);
  } catch {
    // Ni chemin ni adresse : rendue telle quelle, au navigateur de trancher.
    return stored;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return stored;

  // Une image extérieure — S3, un hébergeur d'images — garde son adresse :
  // elle est joignable de partout, et la réécrire la casserait.
  if (!isMachineLocalHost(url.hostname)) return stored;

  return fromPath(`${url.pathname}${url.search}`);
}
