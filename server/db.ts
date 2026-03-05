import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { users, type InsertUser } from "../drizzle/schema";
import { ENV } from "./_core/env";

// ── Database file location ─────────────────────────────────────────────────────
//
// The DB lives at  <project-root>/data/uno-league.db
// This file is auto-created on first run – no environment variable required.
// On Manus AI, Vscode, or any environment, the app "just works".

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "uno-league.db");

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    // Ensure the data directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const sqlite = new Database(DB_PATH);

    // Enable WAL mode for better concurrent read performance
    sqlite.pragma("journal_mode = WAL");

    _db = drizzle(sqlite);

    // Auto-create all tables via migrations so the app works with zero setup.
    try {
      const migrationsFolder = path.join(process.cwd(), "drizzle");
      migrate(_db, { migrationsFolder });
      console.log(`[Database] SQLite ready at ${DB_PATH}`);
    } catch (error) {
      console.warn("[Database] Migration warning:", error);
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
    const existing = db.select().from(users).where(eq(users.openId, user.openId)).get();

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

      db.update(users).set(updateSet).where(eq(users.openId, user.openId)).run();
    } else {
      const values: InsertUser = {
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
      };
      db.insert(users).values(values).run();
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  return db.select().from(users).where(eq(users.openId, openId)).get() ?? undefined;
}

