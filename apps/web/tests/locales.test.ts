import { describe, expect, it } from "vitest";
import { LOCALES } from "@uno/shared";
import { fr } from "../src/locales/fr.js";
import { en } from "../src/locales/en.js";
import { nl } from "../src/locales/nl.js";

/**
 * Ce que TypeScript ne vérifie pas dans les dictionnaires (I18N-001).
 *
 * `Dictionnaire = typeof fr` oblige déjà l'anglais et le néerlandais à porter
 * exactement les mêmes clés : une clé oubliée ou inventée ne compile pas.
 * Restent deux erreurs qu'il laisse passer, et qui ne se voient qu'à
 * l'exécution, dans la langue qu'on ne relit pas :
 *
 *  - **un jeton traduit.** `{amount}` devenu `{bedrag}` compile sans un
 *    murmure et affiche « {bedrag} UNO » au joueur néerlandophone, parce que
 *    `interpoler()` laisse en place ce qu'il ne reconnaît pas — à dessein, un
 *    défaut visible valant mieux qu'une phrase amputée.
 *  - **une chaîne vide**, qui laisse un bouton sans libellé.
 */

const DICTIONNAIRES = { fr, en, nl } as const;

/** Les chemins pointés de toutes les feuilles d'un dictionnaire. */
function chemins(source: unknown, prefixe = ""): string[] {
  if (typeof source !== "object" || source === null) return [];
  return Object.entries(source).flatMap(([cle, valeur]) =>
    typeof valeur === "string"
      ? [`${prefixe}${cle}`]
      : chemins(valeur, `${prefixe}${cle}.`),
  );
}

function lire(source: unknown, chemin: string): string {
  let courant: unknown = source;
  for (const partie of chemin.split(".")) {
    courant = (courant as Record<string, unknown>)[partie];
  }
  return courant as string;
}

/** Les jetons `{nom}` d'une chaîne, triés pour être comparables. */
function jetons(texte: string): string[] {
  return [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

describe("dictionnaires d'interface (I18N-001)", () => {
  it("I18N-001 — les trois langues portent les mêmes clés", () => {
    const reference = chemins(fr).sort();
    expect(chemins(en).sort()).toEqual(reference);
    expect(chemins(nl).sort()).toEqual(reference);
    // Le dictionnaire couvre exactement les langues déclarées.
    expect(Object.keys(DICTIONNAIRES).sort()).toEqual([...LOCALES].sort());
  });

  it("I18N-001 — les jetons d'une clé sont les mêmes partout", () => {
    const fautes: string[] = [];
    for (const chemin of chemins(fr)) {
      const attendus = jetons(lire(fr, chemin));
      for (const [langue, dictionnaire] of Object.entries(DICTIONNAIRES)) {
        const trouves = jetons(lire(dictionnaire, chemin));
        if (trouves.join(",") !== attendus.join(",")) {
          fautes.push(
            `${chemin} [${langue}] : attendu {${attendus.join("}, {")}}, trouvé {${trouves.join("}, {")}}`,
          );
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("I18N-001 — aucune clé ne traduit par du vide", () => {
    const vides: string[] = [];
    for (const [langue, dictionnaire] of Object.entries(DICTIONNAIRES)) {
      for (const chemin of chemins(dictionnaire)) {
        if (lire(dictionnaire, chemin).trim() === "") {
          vides.push(`${chemin} [${langue}]`);
        }
      }
    }
    expect(vides).toEqual([]);
  });
});
