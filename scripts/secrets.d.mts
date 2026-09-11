/**
 * Déclarations de `secrets.mjs`.
 *
 * Le script reste du JavaScript pur, et c'est le point : il doit s'exécuter
 * avec `node` seul sur un dépôt fraîchement cloné, avant toute installation.
 * Le passer en TypeScript imposerait `tsx`, donc `pnpm install`, donc
 * exactement la dépendance qu'on cherche à éviter. Ce fichier lui rend le
 * typage sans lui coûter son autonomie.
 */

/** Secret de signature des jetons de session, 48 octets en base64. */
export function generateSessionSecret(): string;

/** Paire de clés VAPID, au format base64url attendu par le protocole. */
export function generateVapidKeys(): {
  publicKey: string;
  privateKey: string;
};
