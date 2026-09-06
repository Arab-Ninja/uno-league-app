import { sql } from "drizzle-orm";
import { env } from "../env.js";
import { closeDatabase, db } from "./client.js";

/**
 * Vide entièrement la base puis rejoue les migrations.
 * Refusé en production : cette commande détruit des données (CDC §15).
 */
async function main(): Promise<void> {
  if (env.NODE_ENV === "production" || !env.ENABLE_DEV_TOOLS) {
    throw new Error(
      "db:reset est indisponible : réservé aux environnements de développement (ENABLE_DEV_TOOLS=true).",
    );
  }

  const rows = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`,
  );
  const tables = (rows[0] as unknown as { table_name: string }[]).map(
    (row) => row.table_name,
  );

  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of tables) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS \`${table}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

  console.log(`${tables.length} table(s) supprimée(s).`);
  await closeDatabase();
}

main().catch((error: unknown) => {
  console.error("Échec de la réinitialisation :", error);
  process.exitCode = 1;
});
