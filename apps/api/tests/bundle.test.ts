import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Cohérence du bundle de production (DEPLOIEMENT §2).
 *
 * `pnpm build` produit un bundle **ESM**. Toute dépendance qui y est
 * incorporée et qui appelle `require()` — c'est-à-dire tout paquet CommonJS —
 * explose au démarrage : esbuild remplace `require` par une fonction qui
 * lève « Dynamic require of "crypto" is not supported ».
 *
 * Ce défaut est invisible partout ailleurs. En développement on lance les
 * sources avec `tsx`, jamais le bundle ; les tests importent les modules un
 * par un ; le typage ne voit rien. Il ne se manifeste qu'une fois en ligne,
 * au premier démarrage — ce qui est arrivé avec `web-push`, découvert sur
 * Render et non ici.
 *
 * La règle est donc vérifiée statiquement : **toute dépendance d'exécution
 * est externe**. Une seule exception, délibérée — `@uno/shared`, qui n'est
 * pas publié et n'existe qu'en TypeScript : il doit être incorporé.
 */

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Les paquets qu'on incorpore exprès, et la raison de chacun. */
const BUNDLED_ON_PURPOSE: Record<string, string> = {
  "@uno/shared":
    "paquet de l'espace de travail, jamais publié : il n'existe qu'en source",
};

describe("bundle de production", () => {
  const manifest = JSON.parse(
    readFileSync(join(apiRoot, "package.json"), "utf8"),
  ) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };

  it("externalise toutes les dépendances d'exécution", () => {
    const build = manifest.scripts["build"] ?? "";
    const declared = [...build.matchAll(/--external:(\S+)/g)].map(
      (match) => match[1] as string,
    );

    /** `--external:@aws-sdk/*` couvre toute la famille. */
    const isExternal = (name: string) =>
      declared.some((pattern) =>
        pattern.endsWith("*")
          ? name.startsWith(pattern.slice(0, -1))
          : pattern === name,
      );

    const bundled = Object.keys(manifest.dependencies).filter(
      (name) => !isExternal(name) && !(name in BUNDLED_ON_PURPOSE),
    );

    expect(
      bundled,
      "\nCes dépendances seraient incorporées au bundle ESM. Si l'une d'elles " +
        "est un paquet CommonJS,\nle serveur lèvera « Dynamic require ... is " +
        "not supported » au démarrage — en production,\net nulle part " +
        `ailleurs.\n\nAjoutez au script build : ${bundled
          .map((name) => `--external:${name}`)
          .join(" ")}\n`,
    ).toEqual([]);
  });

  it("n'incorpore que ce qui est justifié", () => {
    // L'exception se relit : un paquet publié n'a aucune raison d'y figurer.
    for (const name of Object.keys(BUNDLED_ON_PURPOSE)) {
      expect(name.startsWith("@uno/")).toBe(true);
    }
  });
});
