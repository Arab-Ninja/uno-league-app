import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users, type InsertUser } from "../drizzle/schema";
import { ENV } from "./_core/env";

// ── Database connection ────────────────────────────────────────────────────────
//
// Connects to TiDB Cloud using the DATABASE_URL environment variable.
// Connection pooling is handled by mysql2/promise for better performance.

const DATABASE_URL = process.env.DATABASE_URL || "mysql://3oKYUiTJxJ1nK8a.9a92206c3233:1V5V4GUoxU24yl9sfIBq@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/XLWJzSk7hhsPRGwkKBFYUx";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    try {
      const pool = mysql.createPool({
        uri: DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      _pool = pool;
      _db = drizzle(pool);

      console.log(`[Database] TiDB connection pool initialized`);
    } catch (error) {
      console.error("[Database] Failed to initialize TiDB connection:", error);
      throw error;
    }
  }

  return _db;
}

// ── Auth helpers ───────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = getDb();

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.openId, user.openId));

    if (existing.length > 0) {
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
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId));
  return result[0] ?? undefined;
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _db = null;
    _pool = null;
    console.log("[Database] Connection pool closed");
  }
}
