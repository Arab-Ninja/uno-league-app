import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * Configuration de drizzle-kit.
 *
 * Le fichier `.env` est cherché à la racine du dépôt et non seulement dans le
 * dossier courant : les commandes s'exécutent depuis `apps/api`.
 *
 * `drizzle-kit generate` produit le SQL à partir du schéma TypeScript, sans
 * toucher à la base. Exiger une URL de connexion pour cette commande
 * bloquerait la génération hors ligne, y compris en intégration continue. Une
 * valeur de remplacement est donc utilisée à défaut ; les commandes qui se
 * connectent réellement (`push`, `pull`, `studio`) échoueront explicitement.
 */
function repositoryRoot(): string | null {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

for (const candidate of [
  join(process.cwd(), ".env"),
  ...(repositoryRoot() ? [join(repositoryRoot() as string, ".env")] : []),
]) {
  if (existsSync(candidate)) loadDotenv({ path: candidate, quiet: true });
}

const url =
  process.env["DATABASE_URL"] ??
  "mysql://generation-hors-ligne@127.0.0.1:3306/uno_league";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
