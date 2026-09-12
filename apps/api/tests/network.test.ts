import { describe, expect, it } from "vitest";
import { isPrivateNetworkOrigin } from "../src/lib/network.js";

/**
 * Origines du réseau local (DEV-001).
 *
 * Ce prédicat ouvre une porte — celle du partage de ressources entre
 * origines — et une porte qui s'ouvre mérite qu'on vérifie ce qu'elle laisse
 * passer. Les cas « refusés » comptent donc plus que les cas « acceptés » :
 * ce sont eux qui diraient qu'un site public s'est fait passer pour la
 * machine d'à côté.
 *
 * La tolérance elle-même est bornée au développement par `index.ts` ; ce
 * module ne fait que reconnaître une adresse.
 */

describe("origines du réseau local (DEV-001)", () => {
  it("reconnaît la machine elle-même", () => {
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:4000",
      "http://[::1]:5173",
    ]) {
      expect(isPrivateNetworkOrigin(origin), origin).toBe(true);
    }
  });

  it("reconnaît un appareil du même Wi-Fi", () => {
    for (const origin of [
      "http://192.168.1.42:5173",
      "http://192.168.0.7:5173",
      "http://10.0.0.15:5173",
      "http://172.16.4.9:5173",
      "http://172.31.255.254:5173",
      // Auto-configuration quand le DHCP ne répond pas (RFC 3927).
      "http://169.254.10.3:5173",
      // mDNS : le nom que Bonjour donne à la machine.
      "http://macbook-de-yassine.local:5173",
      "http://[fe80::1c2b:3f4a:5d6e:7f80]:5173",
    ]) {
      expect(isPrivateNetworkOrigin(origin), origin).toBe(true);
    }
  });

  it("refuse une adresse publique", () => {
    for (const origin of [
      "https://exemple.com",
      "http://93.184.216.34",
      // 172.15 et 172.32 encadrent la plage privée sans en faire partie.
      "http://172.15.0.1:5173",
      "http://172.32.0.1:5173",
      // 11/8 et 193.168 ressemblent à des plages privées, et n'en sont pas.
      "http://11.0.0.1:5173",
      "http://193.168.1.1:5173",
    ]) {
      expect(isPrivateNetworkOrigin(origin), origin).toBe(false);
    }
  });

  it("refuse un nom public qui imite une adresse privée", () => {
    // La ruse évidente : faire commencer un domaine qu'on contrôle par une
    // adresse privée. `hostname` rend le domaine entier, pas son préfixe.
    for (const origin of [
      "http://192.168.1.1.attaquant.com",
      "http://127.0.0.1.attaquant.com",
      "http://10.0.0.1.evil.test",
      // L'authentification dans l'URL : l'hôte est ce qui suit l'arobase.
      "http://192.168.1.1@attaquant.com",
      // Un domaine qui contient « .local » sans s'y terminer.
      "http://machine.local.attaquant.com",
    ]) {
      expect(isPrivateNetworkOrigin(origin), origin).toBe(false);
    }
  });

  it("voit à travers les écritures détournées d'une adresse", () => {
    // L'analyseur d'URL ramène décimal, octal et hexadécimal à la forme
    // pointée avant que ce prédicat ne regarde quoi que ce soit. Ces
    // écritures **désignent réellement** une adresse privée : les accepter
    // est juste, et c'est la normalisation qui interdit d'en faire une ruse.
    for (const [origin, resolved] of [
      ["http://2130706433", "127.0.0.1"],
      ["http://0x7f.0.0.1", "127.0.0.1"],
      ["http://017700000001", "127.0.0.1"],
      ["http://0xc0a80101", "192.168.1.1"],
      ["http://192.168.001.042", "192.168.1.34"],
    ] as const) {
      expect(new URL(origin).hostname, origin).toBe(resolved);
      expect(isPrivateNetworkOrigin(origin), origin).toBe(true);
    }

    // Une adresse dont un octet déborde n'est pas une URL valide du tout.
    expect(isPrivateNetworkOrigin("http://192.168.1.300")).toBe(false);
  });

  it("refuse ce qui n'est pas une origine http(s) lisible", () => {
    for (const origin of [
      "",
      "null",
      "192.168.1.42:5173",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "ftp://192.168.1.42",
    ]) {
      expect(isPrivateNetworkOrigin(origin), JSON.stringify(origin)).toBe(false);
    }
  });
});
