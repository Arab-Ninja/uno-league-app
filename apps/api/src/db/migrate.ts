import { migrate } from "drizzle-orm/mysql2/migrator";
import { closeDatabase, db } from "./client.js";

/** Applique les migrations Drizzle en attente. */
async function main(): Promise<void> {
  console.log("Application des migrations...");
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
  console.log("Migrations appliquées.");
  await closeDatabase();
}

main().catch((error: unknown) => {
  console.error("Échec des migrations :", error);
  process.exitCode = 1;
});
