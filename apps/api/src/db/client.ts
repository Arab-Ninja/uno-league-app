import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * Options TLS de la connexion (SEC-001).
 *
 * Les deux drapeaux explicites ne sont pas redondants :
 *
 *  - `rejectUnauthorized` impose que le certificat soit émis par une autorité
 *    reconnue ;
 *  - `verifyIdentity` impose en plus qu'il ait été émis POUR CET HÔTE.
 *
 * Sans le second, mysql2 remplace la vérification du nom d'hôte par une
 * fonction vide : un certificat parfaitement valide mais émis pour un autre
 * domaine serait accepté, ce qui rend une interception possible sur une
 * liaison publique. Les identifiants de base et l'intégralité des données y
 * transitent : la vérification n'est pas optionnelle.
 */
function tlsOptions() {
  if (!env.DATABASE_SSL) return {};

  return {
    ssl: {
      minVersion: "TLSv1.2" as const,
      rejectUnauthorized: true,
      verifyIdentity: true,
      // Autorité privée uniquement ; sinon Node utilise son magasin racine.
      ...(env.DATABASE_CA_PATH
        ? { ca: readFileSync(env.DATABASE_CA_PATH, "utf8") }
        : {}),
    },
  };
}

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
  ...tlsOptions(),
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
