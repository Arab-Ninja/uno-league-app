import type { RowDataPacket } from "mysql2";
import { env } from "../env.js";
import { closeDatabase, pool } from "./client.js";

/**
 * Vide entièrement la base : les migrations sont ensuite rejouées par
 * `pnpm db:migrate`. Refusé en production, cette commande détruit des données
 * (CDC §15).
 *
 * Trois précautions, chacune apprise d'un échec silencieux :
 *
 *  1. **Une seule connexion.** `SET FOREIGN_KEY_CHECKS = 0` ne vaut que pour
 *     la session qui l'exécute. Émis sur le pool, il s'appliquait à une
 *     connexion et les suppressions partaient sur d'autres, encore soumises
 *     aux clés étrangères.
 *  2. **Pas de requête préparée.** Le protocole préparé ne convient pas au
 *     DDL ; `query` envoie l'instruction telle quelle.
 *  3. **Vérification finale.** Le compte de tables restantes est relu après
 *     coup : la commande ne peut plus annoncer une réinitialisation qui n'a
 *     pas eu lieu.
 */
async function main(): Promise<void> {
  if (env.NODE_ENV === "production" || !env.ENABLE_DEV_TOOLS) {
    throw new Error(
      "db:reset est indisponible : réservé aux environnements de développement (ENABLE_DEV_TOOLS=true).",
    );
  }

  const connection = await pool.getConnection();

  try {
    const [database] = await connection.query<(RowDataPacket & { db: string })[]>(
      "SELECT DATABASE() AS db",
    );
    const target = database[0]?.db;
    if (!target) {
      throw new Error("Aucune base sélectionnée : vérifiez DATABASE_URL.");
    }

    const [rows] = await connection.query<(RowDataPacket & { name: string })[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?",
      [target],
    );
    const tables = rows.map((row) => row.name);

    if (tables.length === 0) {
      console.log(`Base « ${target} » déjà vide.`);
      return;
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      // Les identifiants viennent d'information_schema, jamais d'une entrée
      // utilisateur ; l'accent inverse doublé neutralise malgré tout un nom
      // de table exotique.
      const list = tables.map((table) => `\`${table.replace(/`/g, "``")}\``).join(", ");
      await connection.query(`DROP TABLE IF EXISTS ${list}`);
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    const [after] = await connection.query<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ?",
      [target],
    );
    const remaining = Number(after[0]?.total ?? 0);

    if (remaining > 0) {
      throw new Error(
        `${remaining} table(s) subsistent dans « ${target} » : la réinitialisation a échoué.`,
      );
    }

    console.log(`${tables.length} table(s) supprimée(s) dans « ${target} ».`);
    console.log("Rejouez les migrations avec : pnpm db:migrate");
  } finally {
    connection.release();
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error("Échec de la réinitialisation :", error);
  process.exitCode = 1;
});
