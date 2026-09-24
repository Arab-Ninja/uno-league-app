import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { describeConnectionOrigins } from "../env.js";
import { closeDatabase, db } from "./client.js";

/**
 * Dossier des migrations.
 *
 * `fileURLToPath` et non `new URL(...).pathname` : sur Windows, `pathname`
 * renvoie « /C:/Users/... », avec une barre oblique initiale qui rend le
 * chemin invalide, et la migration échoue sur un « Can't find
 * meta/_journal.json » qui ne dit rien de la vraie cause.
 */
const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
);

/** Applique les migrations Drizzle en attente. */
async function main(): Promise<void> {
  console.log(`Application des migrations depuis ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations appliquées.");
  await closeDatabase();
}

main().catch(async (error: unknown) => {
  console.error("Échec des migrations :", error);

  const message = error instanceof Error ? error.message : String(error);
  if (/already exists/i.test(message)) {
    console.error(
      "\nCes tables existent déjà : une migration précédente s'est interrompue " +
        "après les avoir créées,\nsans pouvoir enregistrer qu'elle était passée. " +
        "Repartez d'une base vierge :\n" +
        "  DROP DATABASE <base>; CREATE DATABASE <base> " +
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n",
    );
  }

  // Un refus d'identifiants : le mot de passe est rarement mal tapé ; il est
  // plus souvent lu au mauvais endroit, ou périmé après une régénération.
  const cause = error instanceof Error ? String(error.cause ?? "") : "";
  if (/Access denied/i.test(`${message} ${cause}`)) {
    console.error(
      [
        "",
        "Le serveur de base de données refuse l'utilisateur ou le mot de passe.",
        "Identifiants lus depuis :",
        ...describeConnectionOrigins(),
        "",
        "  - « environnement du système » : une variable Windows masque le fichier",
        "    .env. Dans PowerShell : Remove-Item Env:DATABASE_URL (ou le nom affiché),",
        "    et retirez-la des variables d'environnement de Windows si elle y est.",
        "  - Régénérer le mot de passe dans la console TiDB Cloud invalide l'ancien :",
        "    reportez le nouveau dans .env ET dans Render.",
        "  - Diagnostic détaillé : pnpm db:check",
        "",
      ].join("\n"),
    );
  }

  // Sans fermeture du pool, le processus reste vivant indéfiniment après
  // l'erreur : la commande semble tourner alors qu'elle a déjà échoué.
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
