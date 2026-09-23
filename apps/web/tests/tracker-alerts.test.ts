import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicationBlockers } from "@uno/shared";
import { ALERTES_DE_SAISIE } from "../src/screens/tracker/alertes.js";
import { fr } from "../src/locales/fr.js";

/**
 * I18N-002 — chaque alerte de la saisie vidéo a sa phrase traduite.
 *
 * Les alertes sont écrites en gabarits dans le module partagé ; l'écran les
 * retrouve par ce gabarit. Une alerte ajoutée sans entrée dans la table
 * s'afficherait en français : ce test l'interdit.
 */

const source = readFileSync(
  new URL("../../../packages/shared/src/tracker.ts", import.meta.url),
  "utf8",
);

/** Les gabarits littéraux écrits dans le module des alertes. */
const gabarits = [...source.matchAll(/gabarit\(\s*"((?:[^"\\]|\\.)*)"/g)].map(
  (m) => m[1]!.replace(/\\"/g, '"'),
);

const lire = (cle: string): string | undefined =>
  cle
    .split(".")
    .reduce<unknown>(
      (noeud, morceau) =>
        noeud && typeof noeud === "object"
          ? (noeud as Record<string, unknown>)[morceau]
          : undefined,
      fr,
    ) as string | undefined;

describe("alertes de la saisie vidéo", () => {
  it("chaque gabarit d'alerte a sa clé de traduction", () => {
    expect(gabarits.length).toBeGreaterThan(5);
    expect(gabarits.filter((texte) => !ALERTES_DE_SAISIE[texte])).toEqual([]);
  });

  it("la phrase française de la clé est le gabarit lui-même", () => {
    for (const [gabarit, cle] of Object.entries(ALERTES_DE_SAISIE)) {
      expect(lire(cle)).toBe(gabarit);
    }
  });

  it("une feuille vide produit une alerte connue", () => {
    const alertes = publicationBlockers({
      session: { division: null },
      participants: [],
      teams: [],
      matches: [],
      events: [],
    } as unknown as Parameters<typeof publicationBlockers>[0]);
    expect(alertes.length).toBeGreaterThan(0);
    for (const alerte of alertes) {
      expect(ALERTES_DE_SAISIE[alerte.modele.gabarit]).toBeDefined();
    }
  });
});
