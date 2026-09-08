import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { VENUES } from "@uno/shared";
import { db } from "../src/db/client.js";
import { ensureDefaultVenues } from "../src/services/venues.service.js";
import { appRouter } from "../src/trpc/routers/index.js";
import { createCallerFactory } from "../src/trpc/init.js";
import type { Context } from "../src/trpc/context.js";
import type { AuthenticatedIdentity } from "../src/services/auth.service.js";

/**
 * Utilitaires de test d'intégration.
 *
 * Les tests s'exécutent contre une VRAIE base MySQL (uno_league_test), pas
 * contre des doublures : les garanties que l'on veut vérifier — atomicité,
 * verrous, contraintes d'unicité, CHECK constraints — n'existent que dans la
 * base. Les vérifier sur un faux dépôt ne prouverait rien.
 */

const createCaller = createCallerFactory(appRouter);

/** Client d'appel direct, sans passer par le réseau. */
export type ApiCaller = ReturnType<typeof createCaller>;

/** Réponse HTTP factice : les routeurs y posent le cookie de session. */
function fakeResponse() {
  const headers = new Map<string, string>();
  return {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
  } as unknown as Context["res"];
}

export function callerFor(identity: AuthenticatedIdentity | null): ApiCaller {
  return createCaller({
    identity,
    sessionToken: identity ? "jeton-de-test" : null,
    ip: "127.0.0.1",
    userAgent: "vitest",
    res: fakeResponse(),
  });
}

export const anonymousCaller = (): ApiCaller => callerFor(null);

/** Applique les migrations une seule fois par exécution de la suite. */
let migrated = false;
export async function ensureSchema(): Promise<void> {
  if (migrated) return;
  await migrate(db, {
    // fileURLToPath : voir migrate.ts, `pathname` casse sur Windows.
    migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle"),
  });
  migrated = true;
}

/**
 * Tables à vider entre deux tests.
 *
 * La liste est **lue en base** plutôt qu'écrite à la main : une liste figée se
 * périme au premier ajout de table, et une table oubliée ne fait pas échouer
 * les tests — elle les fait mentir. C'est exactement ce qui est arrivé à
 * `admin_events` : les clés d'évènement d'un test survivaient au suivant, où
 * l'écriture était alors ignorée comme un doublon.
 *
 * Seul le journal des migrations est préservé : le vider forcerait à rejouer
 * tout le schéma avant chaque test.
 */
const KEPT_TABLES = new Set(["__drizzle_migrations"]);

async function businessTables(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(
    sql`SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
  );

  return (rows[0] as unknown as { name: string }[])
    .map((row) => row.name)
    .filter((name) => !KEPT_TABLES.has(name));
}

/** Vide toutes les tables métier entre deux tests. */
export async function resetDatabase(): Promise<void> {
  await ensureSchema();

  const tables = await businessTables();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table.replace(/`/g, "``")}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

  // Les salles sont désormais des données, pas des constantes : sans elles
  // aucune session ne peut être proposée. Le serveur les crée au démarrage
  // (ADMIN-007) ; les tests font de même, pour partir du même état.
  await ensureDefaultVenues(
    VENUES.map((venue) => ({
      slug: venue.id,
      name: venue.name,
      timezone: venue.timezone,
    })),
  );
}

export interface TestPlayer {
  identity: AuthenticatedIdentity;
  caller: ApiCaller;
  email: string;
}

let sequence = 0;

/** Crée un compte via la vraie route d'inscription (AUTH-001). */
export async function createPlayer(
  overrides: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    accountType: "player" | "referee";
  }> = {},
): Promise<TestPlayer> {
  sequence += 1;
  const email = overrides.email ?? `joueur${sequence}.${Date.now()}@test.local`;

  const result = await anonymousCaller().auth.signup({
    firstName: overrides.firstName ?? `Prenom${sequence}`,
    lastName: overrides.lastName ?? `Nom${sequence}`,
    dateOfBirth: "1995-03-15",
    email,
    nationality: "BE",
    password: overrides.password ?? "Password1",
    profilePhotoUrl: null,
    accountType: overrides.accountType ?? "player",
  });

  const identity: AuthenticatedIdentity = {
    userId: result.user.id,
    playerId: result.user.playerId,
    email: result.user.email,
    role: result.user.role,
  };

  return { identity, caller: callerFor(identity), email };
}

/** Promeut un compte au rôle administrateur, directement en base. */
export async function promoteToAdmin(player: TestPlayer): Promise<TestPlayer> {
  await db.execute(
    sql`UPDATE users SET role = 'admin' WHERE id = ${player.identity.userId}`,
  );
  const identity: AuthenticatedIdentity = { ...player.identity, role: "admin" };
  return { ...player, identity, caller: callerFor(identity) };
}

/** Crédite un joueur sans passer par l'API, pour préparer un scénario. */
export async function grantUno(playerId: number, amount: number): Promise<void> {
  const { credit } = await import("../src/services/ledger.service.js");
  await db.transaction(async (tx) => {
    await credit(tx, {
      playerId,
      amount,
      type: "admin_credit",
      description: "Préparation de test",
    });
  });
}

export async function balanceOf(playerId: number): Promise<number> {
  const rows = await db.execute<{ uno_points: number }>(
    sql`SELECT uno_points FROM players WHERE id = ${playerId}`,
  );
  return Number((rows[0] as unknown as { uno_points: number }[])[0]?.uno_points ?? 0);
}

/** Date ISO située à J+n dans le fuseau des lieux de jeu. */
export function daysFromNow(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
}
