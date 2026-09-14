#!/usr/bin/env node
/**
 * Démarre l'application pour un téléphone du même Wi-Fi (DEV-001, DEV-002).
 *
 * Trois choses doivent s'accorder pour qu'un téléphone puisse tout essayer,
 * caméra comprise. Les régler à la main à chaque session est une source de
 * pannes silencieuses ; cette commande les déduit d'une seule lecture de
 * l'adresse réseau :
 *
 *  1. **Vite écoute sur toutes les interfaces**, sans quoi il n'accepte que
 *     les connexions venues de la machine elle-même ;
 *  2. **la page est servie en HTTPS**. La caméra n'est offerte que dans un
 *     contexte sécurisé : sur `http://192.168.x.x`, le navigateur refuse —
 *     poliment sur Android, sans un mot sur iOS ;
 *  3. **les photos envoyées portent une adresse joignable**. L'API les
 *     publie par défaut sous `http://localhost:4000` : une adresse qui, vue
 *     du téléphone, désigne le téléphone. Elle est donc réécrite ici vers le
 *     serveur de développement, qui relaie déjà l'API.
 *
 * Sans dépendance autre que celles du projet : cette commande doit rester
 * lisible par quelqu'un qui débogue un réseau récalcitrant.
 */

import { spawn } from "node:child_process";
import { lanAddresses } from "./lan.mjs";

const WEB_PORT = Number(process.env["WEB_PORT"] ?? 5173);

function chooseAddress() {
  // Une adresse imposée l'emporte : plusieurs cartes réseau, un VPN, ou une
  // machine dont on sait laquelle le téléphone peut joindre.
  const forced = process.env["LAN_IP"];
  if (forced) return forced;

  const addresses = lanAddresses();
  return addresses[0]?.address ?? null;
}

function banner(address) {
  const url = `https://${address}:${WEB_PORT}`;
  const line = "─".repeat(url.length + 6);

  console.log("");
  console.log(`  ┌${line}┐`);
  console.log(`  │   ${url}   │`);
  console.log(`  └${line}┘`);
  console.log("");
  console.log("  Ouvrez cette adresse sur le téléphone, en HTTPS.");
  console.log("");
  console.log("  Le certificat est auto-signé : le navigateur affichera un");
  console.log("  avertissement. Acceptez-le une fois — c'est votre propre");
  console.log("  ordinateur.");
  console.log("");
  console.log("    • Safari  : « Afficher les détails » → « visiter ce site »");
  console.log("    • Chrome  : « Paramètres avancés » → « Continuer vers… »");
  console.log("");
  console.log("  Sans cette acceptation, la prise de photo ne fonctionnera pas :");
  console.log("  la caméra n'est offerte qu'aux pages sécurisées.");
  console.log("");
  console.log("  Le téléphone doit être sur le même Wi-Fi que cet ordinateur,");
  console.log("  et le pare-feu Windows doit autoriser Node sur les réseaux");
  console.log("  privés (la question est posée au premier démarrage).");
  console.log("");
}

function main() {
  const address = chooseAddress();

  if (!address) {
    console.error(
      "Aucune adresse de réseau local trouvée.\n" +
        "L'ordinateur est-il connecté au Wi-Fi ou au câble réseau ?\n" +
        "Vous pouvez forcer l'adresse : LAN_IP=192.168.1.42 pnpm dev:mobile",
    );
    process.exit(1);
  }

  banner(address);

  /**
   * Une seule chaîne, et non un tableau d'arguments.
   *
   * `shell: true` est nécessaire sous Windows, où `pnpm` est un script
   * `.cmd` — mais il recolle alors les arguments sans leurs guillemets, et
   * `pnpm --filter @uno/api dev` se scinde en deux commandes dont la seconde
   * n'existe pas. La chaîne laisse l'interpréteur faire son travail.
   */
  const command =
    "pnpm exec concurrently -k -n api,web -c blue,magenta " +
    '"pnpm --filter @uno/api dev" ' +
    '"pnpm --filter @uno/web dev:lan"';

  const child = spawn(command, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_HTTPS: "1",
      /**
       * L'adresse publique des fichiers envoyés. Elle passe par Vite — qui
       * relaie vers l'API — pour deux raisons : le téléphone ne connaît pas
       * `localhost`, et une page HTTPS ne charge pas une image en HTTP.
       */
      STORAGE_PUBLIC_URL: `https://${address}:${WEB_PORT}/uploads`,
    },
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
