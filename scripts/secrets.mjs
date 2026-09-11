#!/usr/bin/env node
/**
 * Génère les secrets nécessaires au déploiement (DEPLOIEMENT §0, étape 2).
 *
 * **Ce fichier ne dépend de rien.** Ni d'`openssl`, absent de Windows. Ni
 * d'une dépendance installée : il n'importe que `node:crypto`, si bien qu'il
 * tourne sur un dépôt fraîchement cloné, avant même `pnpm install`. C'est
 * voulu — c'est la toute première commande d'une mise en ligne, celle qu'on
 * lance quand rien n'est encore prêt.
 *
 *   node scripts/secrets.mjs        (partout, sans rien installer)
 *   pnpm secrets                    (si les dépendances sont déjà là)
 *
 * Les clés VAPID sont à **conserver** : les remplacer plus tard obligerait
 * chaque joueur à réautoriser les notifications.
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Paire de clés VAPID pour les notifications push (ANN-004).
 *
 * Une clé VAPID est une paire de courbe elliptique P-256, présentée sous une
 * forme précise que le protocole impose :
 *
 *  - la **publique** est le point non compressé `0x04 ‖ x ‖ y`, soit 65
 *    octets, en base64url. C'est elle que le navigateur reçoit et vérifie ;
 *  - la **privée** est le scalaire `d` seul, 32 octets, en base64url.
 *
 * `web-push` fait exactement cela ; le refaire ici avec `node:crypto` évite
 * d'exiger une dépendance installée pour la première commande du parcours.
 * L'équivalence est vérifiée par `secrets.test.ts` : web-push signe une
 * requête réelle avec les clés produites ici.
 */
export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });

  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pub.x, "base64url"),
    Buffer.from(pub.y, "base64url"),
  ]);

  return {
    publicKey: point.toString("base64url"),
    privateKey: Buffer.from(priv.d, "base64url").toString("base64url"),
  };
}

/** Secret de signature des jetons de session (SEC-001). */
export function generateSessionSecret() {
  return randomBytes(48).toString("base64");
}

function main() {
  const vapid = generateVapidKeys();

  console.log(
    [
      "",
      "Secrets générés. Copiez ces quatre lignes dans les variables",
      "d'environnement de votre hébergeur — pas dans le dépôt.",
      "",
      `SESSION_SECRET=${generateSessionSecret()}`,
      `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
      `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
      "VAPID_SUBJECT=mailto:votre.adresse@exemple.com",
      "",
      "Remplacez l'adresse de VAPID_SUBJECT par la vôtre : les services de",
      "notification s'en servent pour vous joindre en cas de problème.",
      "",
      "Conservez les clés VAPID. Les remplacer obligerait chaque joueur à",
      "réautoriser les notifications.",
      "",
    ].join("\n"),
  );
}

/**
 * Exécuté directement, et non importé par un test.
 *
 * La comparaison passe par `fileURLToPath` plutôt que par un `endsWith` sur
 * l'URL : sous Windows, `process.argv[1]` est un chemin `C:\\…` à
 * contre-barres dont la lettre de lecteur peut différer de casse, et une
 * comparaison textuelle y échoue silencieusement — le script ne s'exécuterait
 * alors pas, sans le moindre message.
 */
if (process.argv[1]) {
  const invoked = resolve(process.argv[1]);
  const self = resolve(fileURLToPath(import.meta.url));
  if (invoked === self) main();
}
