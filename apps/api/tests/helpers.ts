import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { db } from "../src/db/client.js";
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

const TABLES = [
  "notification_deliveries",
  "announcement_reads",
  "announcements",
  "audit_logs",
  "device_tokens",
  "match_stats",
  "matches",
  "team_members",
  "teams",
  "order_items",
  "orders",
  "transactions",
  "payments",
  "proposal_participants",
  "proposals",
  "shop_items",
  "seasons",
  "players",
  "sessions",
  "users",
];

/** Vide toutes les tables métier entre deux tests. */
export async function resetDatabase(): Promise<void> {
  await ensureSchema();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
}

export interface TestPlayer {
  identity: AuthenticatedIdentity;
  caller: ApiCaller;
  email: string;
}

let sequence = 0;

/** Crée un compte via la vraie route d'inscription (AUTH-001). */
export async function createPlayer(
  overrides: Partial<{ firstName: string; lastName: string; email: string; password: string }> = {},
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
