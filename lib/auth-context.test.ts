import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { players } from "@/drizzle/schema";
import path from "path";
import fs from "fs";

describe("AuthContext Backend Persistence", () => {
  let db: ReturnType<typeof drizzle>;
  let testDbPath: string;

  beforeAll(() => {
    // Create a test database
    testDbPath = path.join(process.cwd(), "data", "test-uno-league.db");
    const sqlite = new Database(testDbPath);
    sqlite.pragma("journal_mode = WAL");
    db = drizzle(sqlite);

    // Create tables
    try {
      const migrationsFolder = path.join(process.cwd(), "drizzle");
      // Run migrations manually for test
      const migrationFiles = fs.readdirSync(migrationsFolder).filter((f) => f.endsWith(".sql"));
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsFolder, file), "utf-8");
        sqlite.exec(sql);
      }
    } catch (error) {
      console.warn("Migration warning:", error);
    }
  });

  afterAll(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it("should save a new player to the database", () => {
    const testPlayer = {
      openId: "test@example.com",
      name: "Test Player",
      firstName: "Test",
      lastName: "Player",
      email: "test@example.com",
      division: "D3" as const,
      unoPoints: 1000,
      xp: 0,
      level: 1,
      statsGoals: 0,
      statsAssists: 0,
      statsDefenses: 0,
      statsSaves: 0,
      statsMotm: 0,
      avatar: "⚽",
      nationality: "Belgique",
      dateOfBirth: "1990-01-01",
      profilePhoto: null,
    };

    // Insert player
    db.insert(players).values(testPlayer).run();

    // Verify player was saved
    const savedPlayer = db
      .select()
      .from(players)
      .where(eq(players.openId, "test@example.com"))
      .get();

    expect(savedPlayer).toBeDefined();
    expect(savedPlayer?.openId).toBe("test@example.com");
    expect(savedPlayer?.name).toBe("Test Player");
    expect(savedPlayer?.unoPoints).toBe(1000);
    expect(savedPlayer?.division).toBe("D3");
  });

  it("should update player UNO points", () => {
    const testPlayer = {
      openId: "update-test@example.com",
      name: "Update Test",
      firstName: "Update",
      lastName: "Test",
      email: "update-test@example.com",
      division: "D3" as const,
      unoPoints: 500,
      xp: 0,
      level: 1,
      statsGoals: 0,
      statsAssists: 0,
      statsDefenses: 0,
      statsSaves: 0,
      statsMotm: 0,
      avatar: "⚽",
      nationality: "Belgique",
      dateOfBirth: "1990-01-01",
      profilePhoto: null,
    };

    // Insert player
    db.insert(players).values(testPlayer).run();

    // Update UNO points
    const newPoints = 1500;
    db.update(players)
      .set({ unoPoints: newPoints })
      .where(eq(players.openId, "update-test@example.com"))
      .run();

    // Verify update
    const updatedPlayer = db
      .select()
      .from(players)
      .where(eq(players.openId, "update-test@example.com"))
      .get();

    expect(updatedPlayer?.unoPoints).toBe(1500);
  });

  it("should update player division", () => {
    const testPlayer = {
      openId: "division-test@example.com",
      name: "Division Test",
      firstName: "Division",
      lastName: "Test",
      email: "division-test@example.com",
      division: "D3" as const,
      unoPoints: 1000,
      xp: 0,
      level: 1,
      statsGoals: 0,
      statsAssists: 0,
      statsDefenses: 0,
      statsSaves: 0,
      statsMotm: 0,
      avatar: "⚽",
      nationality: "Belgique",
      dateOfBirth: "1990-01-01",
      profilePhoto: null,
    };

    // Insert player
    db.insert(players).values(testPlayer).run();

    // Update division
    db.update(players)
      .set({ division: "D1" })
      .where(eq(players.openId, "division-test@example.com"))
      .run();

    // Verify update
    const updatedPlayer = db
      .select()
      .from(players)
      .where(eq(players.openId, "division-test@example.com"))
      .get();

    expect(updatedPlayer?.division).toBe("D1");
  });
});
