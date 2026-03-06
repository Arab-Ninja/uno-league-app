import path from "path";
import mysql from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { eq } from "drizzle-orm";
import { users, type InsertUser } from "../drizzle/schema";
import { ENV } from "./_core/env";

// ── Database connection ────────────────────────────────────────────────────────
//
// Connects to TiDB Cloud (MySQL-compatible) using DATABASE_URL from the
// environment.  The connection pool is created once and reused across requests.
// Tables are auto-created on first startup via Drizzle migrations.

let _pool: mysql.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getPool(): mysql.Pool {
  if (!_pool) {
    if (!ENV.databaseUrl) {
      throw new Error(
        "[Database] DATABASE_URL environment variable is required. " +
        "Set it to your TiDB Cloud MySQL connection URL, e.g.: " +
        "mysql://user:password@host:4000/database",
      );
    }
    _pool = mysql.createPool({
      uri: ENV.databaseUrl,
      ssl: { rejectUnauthorized: true },
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "+00:00",
    });
  }
  return _pool;
}

export function getDb() {
  if (!_db) {
    _db = drizzle({ client: getPool() });
    console.log("[Database] MySQL pool ready");
  }
  return _db;
}

/** Run pending Drizzle migrations to ensure all tables exist. */
export async function initDb(): Promise<void> {
  const db = getDb();
  try {
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    await migrate(db, { migrationsFolder });
    console.log("[Database] Migrations applied successfully");
  } catch (error) {
    console.warn("[Database] Migration warning:", error);
  }
}

// ── Auth helpers ───────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = getDb();

  try {
    const [existing] = await db.select().from(users).where(eq(users.openId, user.openId));

    if (existing) {
      const updateSet: Partial<InsertUser> = {};
      if (user.name !== undefined) updateSet.name = user.name ?? null;
      if (user.email !== undefined) updateSet.email = user.email ?? null;
      if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod ?? null;
      if (user.lastSignedIn !== undefined) updateSet.lastSignedIn = user.lastSignedIn;
      if (user.role !== undefined) updateSet.role = user.role;

      if (Object.keys(updateSet).length === 0) {
        updateSet.lastSignedIn = new Date();
      }

      await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
    } else {
      const values: InsertUser = {
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
      };
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.openId, openId));
  return user ?? undefined;
}

