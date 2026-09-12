#!/usr/bin/env node
/**
 * Affiche les adresses auxquelles un téléphone du même Wi-Fi peut joindre
 * l'application (DEV-001).
 *
 * L'adresse d'une machine sur son réseau local n'est pas connue d'avance :
 * le routeur la distribue, et elle change. Une commande qui la lit au moment
 * où l'on en a besoin évite la chasse dans les réglages système — et la faute
 * de frappe qu'on cherche ensuite pendant dix minutes.
 *
 * Sans dépendance, comme `scripts/secrets.mjs` : cette commande doit pouvoir
 * tourner avant même un `pnpm install`.
 */

import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const WEB_PORT = Number(process.env["WEB_PORT"] ?? 5173);

/** Les IPv4 de cette machine sur ses réseaux, hors bouclage. */
export function lanAddresses() {
  const found = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      found.push({ name, address: address.address });
    }
  }
  // Les adresses d'auto-configuration (169.254.x) passent en dernier : elles
  // signalent un DHCP muet, et ne mènent presque jamais nulle part.
  return found.sort((a, b) => {
    const weight = (value) => (value.address.startsWith("169.254.") ? 1 : 0);
    return weight(a) - weight(b);
  });
}

function main() {
  const addresses = lanAddresses();

  if (addresses.length === 0) {
    console.log(
      "Aucune adresse de réseau local trouvée.\n" +
        "L'ordinateur est-il connecté au Wi-Fi ou au câble réseau ?",
    );
    return;
  }

  console.log("");
  console.log("  Ouvrez cette adresse dans Safari, sur l'iPhone :");
  console.log("");
  for (const { name, address } of addresses) {
    console.log(`    http://${address}:${WEB_PORT}      (${name})`);
  }
  console.log("");
  console.log("  L'iPhone doit être sur le même Wi-Fi que cet ordinateur.");
  console.log("  Puis : Partager → « Sur l'écran d'accueil ».");
  console.log("");
}

// Exécution directe seulement : l'import depuis un test ne doit rien afficher.
if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  main();
}
