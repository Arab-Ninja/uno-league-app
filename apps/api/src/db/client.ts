import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * Pool MySQL/TiDB partagé.
 *
 * `timezone: "Z"` : les objets Date sont écrits et relus en UTC sans aucune
 * conversion implicite liée au fuseau du serveur (TECH-002).
 *
 * `supportBigNumbers` + `decimalNumbers` : les entiers et décimaux reviennent
 * en types JavaScript exploitables plutôt qu'en chaînes.
 */
export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: env.DATABASE_POOL_SIZE,
  timezone: "Z",
  supportBigNumbers: true,
  decimalNumbers: true,
  charset: "utf8mb4",
  ...(env.DATABASE_SSL ? { ssl: { minVersion: "TLSv1.2" } } : {}),
});

export const db = drizzle(pool, { schema, mode: "default" });

export type Database = typeof db;

/** Type d'une transaction Drizzle, pour typer les fonctions transactionnelles. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Accepte indifféremment le pool ou une transaction en cours. */
export type Executor = Database | Transaction;

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
