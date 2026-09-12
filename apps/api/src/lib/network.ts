/**
 * Reconnaissance des adresses du réseau local (DEV-001).
 *
 * Tester l'application depuis un téléphone du même Wi-Fi demande que le
 * serveur accepte une origine qu'il ne connaissait pas d'avance :
 * `http://192.168.1.42:5173` change d'une maison à l'autre, et d'un jour à
 * l'autre quand le routeur redistribue les baux DHCP. L'inscrire à la main
 * dans `CORS_ORIGINS` marche une fois, puis se périme en silence.
 *
 * Ce module dit si une origine appartient à la machine elle-même ou à un
 * réseau privé. **Il ne décide de rien** : c'est l'appelant qui restreint son
 * usage au développement. En production, la liste explicite reste seule
 * autorité — une origine privée y serait au mieux inutile, au pire le signe
 * d'un en-tête falsifié.
 */

/** Adresses de bouclage : la machine qui parle à elle-même. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Vrai pour une IPv4 de réseau privé ou de lien-local.
 *
 * Les plages sont celles de la RFC 1918 (10/8, 172.16/12, 192.168/16) et de
 * la RFC 3927 (169.254/16, auto-configuration quand le DHCP ne répond pas).
 */
function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map((part) => {
    // Appelé depuis une URL analysée, `hostname` est déjà canonique :
    // l'analyseur a ramené décimal, octal et hexadécimal à la forme pointée.
    // Ce filtre ne sert donc qu'au cas où la fonction recevrait un nom brut.
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (octets.some((value) => Number.isNaN(value) || value > 255)) return false;

  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Vrai pour une IPv6 de lien-local (`fe80::/10`) ou unique-local (`fc00::/7`). */
function isPrivateIpv6(hostname: string): boolean {
  // `new URL()` conserve les crochets de l'écriture en autorité.
  const address = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  // Une adresse de lien-local porte parfois un identifiant de zone (« %en0 »).
  const withoutZone = address.split("%")[0] ?? "";
  if (/^fe[89ab][0-9a-f]?:/.test(withoutZone)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(withoutZone)) return true;
  return false;
}

/**
 * Vrai si cette origine désigne la machine elle-même ou un appareil du même
 * réseau privé.
 *
 * Une origine malformée rend `false` : on ne devine pas l'intention d'un
 * en-tête qu'on ne sait pas lire.
 */
export function isPrivateNetworkOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const hostname = url.hostname.toLowerCase();
  if (LOOPBACK.has(hostname)) return true;
  // `.local` est le domaine du mDNS (Bonjour) : « macbook-de-yassine.local ».
  if (hostname.endsWith(".local")) return true;
  if (isPrivateIpv4(hostname)) return true;
  if (isPrivateIpv6(hostname)) return true;
  return false;
}
