import { env } from "../env.js";

/**
 * Les liens que porte un courrier (MAIL-001).
 *
 * **Pourquoi l'adresse publique est une variable et non une déduction.**
 * Partout ailleurs, l'application se contente d'adresses relatives : le
 * navigateur sait sur quel domaine il est, et `/sessions/12` suffit. Une boîte
 * de réception ne sait rien de tout cela — un lien relatif y est inerte.
 *
 * La tentation est alors de reconstruire l'adresse depuis l'en-tête `Host` de
 * la requête qui a déclenché l'envoi. C'est une faille connue, dite
 * *empoisonnement d'en-tête Host* : cet en-tête est fourni par le client.
 * Quelqu'un qui demande une réinitialisation pour l'adresse d'un autre en
 * remplaçant `Host` par son propre serveur recevrait, à la place de la
 * victime, un courrier dont le lien pointe chez lui — et le jeton avec.
 *
 * L'adresse vient donc de la configuration, où seul l'exploitant écrit.
 */

/** La racine publique du site, sans barre oblique finale. */
export function publicWebUrl(): string | null {
  const brut = env.PUBLIC_WEB_URL;
  if (!brut) return null;
  return brut.replace(/\/+$/, "");
}

/**
 * Transforme un chemin interne en adresse complète.
 *
 * Renvoie `undefined` quand l'adresse publique n'est pas configurée : un
 * courrier sans bouton vaut mieux qu'un courrier dont le bouton ne mène nulle
 * part. Les gabarits traitent ce cas.
 */
export function absoluteUrl(path: string): string | undefined {
  const racine = publicWebUrl();
  if (!racine) return undefined;

  // Un chemin déjà absolu est rendu tel quel : certains appelants en
  // construisent un complet, et le préfixer une seconde fois le casserait.
  if (/^https?:\/\//i.test(path)) return path;

  return `${racine}${path.startsWith("/") ? "" : "/"}${path}`;
}
