import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  VENUES,
  addDaysIso,
  todayIso,
} from "@uno/shared";
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
    locale: identity?.locale ?? "fr",
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
    migrationsFolder: join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "drizzle",
    ),
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
    await db.execute(
      sql.raw(`TRUNCATE TABLE \`${table.replace(/`/g, "``")}\``),
    );
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
      ...(venue.address ? { address: venue.address } : {}),
      ...(venue.reservedModeId ? { reservedModeId: venue.reservedModeId } : {}),
    })),
  );
}

export interface TestPlayer {
  identity: AuthenticatedIdentity;
  caller: ApiCaller;
  email: string;
}

let sequence = 0;

/**
 * Crée un compte via la vraie route d'inscription (AUTH-001).
 *
 * `uno` crédite le compte dans la foulée, et vaut **zéro par défaut** — comme
 * en production depuis que la ligue n'offre plus rien à l'inscription.
 *
 * Un scénario qui dépense doit donc dire d'où vient l'argent. C'est plus
 * verbeux qu'un bonus implicite, et c'est le but : tant que le bonus finançait
 * tout le monde en silence, un test de paiement ne prouvait pas qu'on savait
 * débiter un joueur, seulement qu'il naissait riche.
 *
 * Le crédit passe par le registre, jamais par une écriture directe sur le
 * solde : `auditPlayerBalance` reste donc vrai pour ces comptes.
 */
export async function createPlayer(
  overrides: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    accountType: "player" | "referee";
    uno: number;
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
    isSupervisor: false,
    locale: DEFAULT_LOCALE,
  };

  if (overrides.uno) await grantUno(identity.playerId, overrides.uno);

  return { identity, caller: callerFor(identity), email };
}

/**
 * Solde de départ des scénarios qui dépensent.
 *
 * Mille UNO : de quoi payer plusieurs places de ligue à 200, sans être un
 * chiffre rond choisi au hasard — c'est le montant que le bonus de bienvenue
 * versait, et le garder évite de réécrire les soldes attendus de dizaines de
 * tests écrits avant son retrait.
 */
export const TEST_START_UNO = 1000;

/**
 * Un compte déjà approvisionné.
 *
 * `createPlayer` naît à zéro, comme en production. La plupart des recettes —
 * calendrier, clubs, boutique — ne parlent pourtant pas d'argent : elles
 * inscrivent, paient, règlent, et tiennent la solvabilité pour acquise. Ces
 * fichiers importent donc celui-ci sous le nom `createPlayer`, ce qui dit en
 * une ligne, en tête de fichier, que leurs joueurs ont de quoi payer.
 *
 * Les tests qui portent **sur** l'argent — le registre, le solde d'un compte
 * neuf — gardent l'autre : c'est là que le zéro se vérifie.
 */
export function createFundedPlayer(
  overrides: Parameters<typeof createPlayer>[0] = {},
): Promise<TestPlayer> {
  return createPlayer({ uno: TEST_START_UNO, ...overrides });
}

/** Promeut un compte au rôle administrateur, directement en base. */
export async function promoteToAdmin(player: TestPlayer): Promise<TestPlayer> {
  await db.execute(
    sql`UPDATE users SET role = 'admin' WHERE id = ${player.identity.userId}`,
  );
  const identity: AuthenticatedIdentity = { ...player.identity, role: "admin" };
  return { ...player, identity, caller: callerFor(identity) };
}

/**
 * Relit l'identité d'un joueur en base et reconstruit son appelant.
 *
 * Une vraie requête HTTP repasse par `resolveSession` : rôle et droit de
 * supervision y sont relus à chaque appel. Le harnais, lui, fige l'identité
 * au moment de l'inscription — un droit accordé en cours de test resterait
 * donc invisible à l'appelant. À appeler après toute mutation de droits.
 */
export async function reloadIdentity(player: TestPlayer): Promise<TestPlayer> {
  const rows = await db.execute<{
    role: "user" | "admin";
    is_supervisor: number;
  }>(
    sql`SELECT u.role AS role, p.is_supervisor AS is_supervisor
        FROM players p JOIN users u ON u.id = p.user_id
        WHERE p.id = ${player.identity.playerId}`,
  );
  const row = (
    rows[0] as unknown as { role: "user" | "admin"; is_supervisor: number }[]
  )[0];

  const identity: AuthenticatedIdentity = {
    ...player.identity,
    role: row?.role ?? player.identity.role,
    isSupervisor: Boolean(row?.is_supervisor),
  };
  return { ...player, identity, caller: callerFor(identity) };
}

/** Crédite un joueur sans passer par l'API, pour préparer un scénario. */
export async function grantUno(
  playerId: number,
  amount: number,
): Promise<void> {
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
  return Number(
    (rows[0] as unknown as { uno_points: number }[])[0]?.uno_points ?? 0,
  );
}

/**
 * Marque un joueur comme ayant joué, sans rejouer une séance entière.
 *
 * Depuis RANK-006, le classement ignore qui n'a disputé aucune séance. Les
 * tests qui portent sur *autre chose* — le filtrage par division, les quotas
 * de montée — n'ont pas à monter quinze joueurs et une session complète pour
 * y figurer : ils déclarent ici, en une ligne, la seule condition qui leur
 * manque. Les tests qui portent sur la règle elle-même, eux, jouent vraiment.
 */
export async function markPlayed(
  playerId: number,
  sessions = 1,
): Promise<void> {
  await db.execute(
    sql`UPDATE players SET matches_played = matches_played + ${sessions} WHERE id = ${playerId}`,
  );
}

/** Date ISO située à J+n dans le fuseau des lieux de jeu. */
/**
 * Une date à `days` jours d'ici, **dans le calendrier du serveur**.
 *
 * Le détail qui compte est le fuseau. Le serveur ne raisonne jamais en UTC
 * pour une date de séance : il prend « aujourd'hui » dans le fuseau de la
 * salle, parce que c'est là que les joueurs se déplacent. Cette fonction
 * calculait, elle, en UTC.
 *
 * Les deux coïncident la plupart du temps, et divergent d'un jour entier
 * chaque soir entre 22 h et minuit UTC — l'heure d'été belge étant UTC+2, il
 * est déjà demain à Bruxelles. Les tests de préavis échouaient alors tous en
 * bloc, en annonçant qu'une date à sept jours n'en respectait pas sept : un
 * message parfaitement trompeur, pour une suite qui passait le matin même.
 *
 * Passer par `todayIso` aligne le harnais sur la règle qu'il vérifie.
 */
export function daysFromNow(days: number, timeZone = DEFAULT_TIMEZONE): string {
  return addDaysIso(todayIso(timeZone), days);
}
