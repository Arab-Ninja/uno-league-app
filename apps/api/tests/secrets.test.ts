import { describe, expect, it } from "vitest";
import webpush from "web-push";
import {
  generateSessionSecret,
  generateVapidKeys,
} from "../../../scripts/secrets.mjs";

/**
 * Secrets de déploiement (DEPLOIEMENT §0).
 *
 * `scripts/secrets.mjs` reproduit avec `node:crypto` seul ce que `web-push`
 * et `openssl` font d'ordinaire. C'est délibéré : la génération des secrets
 * est la **première** commande d'une mise en ligne, celle qu'on lance sur un
 * dépôt fraîchement cloné, sur une machine Windows où `openssl` n'existe pas
 * et où `pnpm install` n'a pas encore tourné.
 *
 * Refaire un format à la main se paie s'il dérive. Ces tests verrouillent
 * donc l'équivalence là où elle compte : `web-push` doit accepter les clés
 * produites ici et signer une requête réelle avec.
 */

describe("secrets de déploiement", () => {
  it("les clés VAPID ont la forme imposée par le protocole", () => {
    const { publicKey, privateKey } = generateVapidKeys();

    // Point non compressé : 0x04 ‖ x ‖ y, soit 65 octets.
    const point = Buffer.from(publicKey, "base64url");
    expect(point).toHaveLength(65);
    expect(point[0]).toBe(0x04);

    // Scalaire privé : 32 octets.
    expect(Buffer.from(privateKey, "base64url")).toHaveLength(32);

    // base64url : ni '+', ni '/', ni '=' — sans quoi l'en-tête HTTP casse.
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("web-push signe une requête avec les clés produites ici", () => {
    const { publicKey, privateKey } = generateVapidKeys();

    // L'épreuve qui compte : pas une comparaison de longueurs, mais une
    // signature réelle par la bibliothèque qui les utilisera en production.
    const headers = webpush.getVapidHeaders(
      "https://fcm.googleapis.com",
      "mailto:test@exemple.com",
      publicKey,
      privateKey,
      "aes128gcm",
    );

    expect(headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
  });

  it("deux exécutations ne produisent jamais les mêmes secrets", () => {
    expect(generateVapidKeys().privateKey).not.toBe(
      generateVapidKeys().privateKey,
    );
    expect(generateSessionSecret()).not.toBe(generateSessionSecret());
    // 48 octets : assez pour signer des jetons de session sans réfléchir.
    expect(Buffer.from(generateSessionSecret(), "base64")).toHaveLength(48);
  });
});
