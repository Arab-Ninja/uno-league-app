/**
 * Seed function for UNO League demo data.
 *
 * Creates fictitious players, propositions, reservations and sessions so that
 * the payment flow is immediately visible on the calendar without any manual
 * data entry.  The seed is idempotent: it only inserts rows that are missing,
 * so calling it multiple times is safe.
 *
 * Player openIds deliberately match the emails used in lib/mock-data.ts so
 * that the logged-in mock user (Yassine, yassine@example.com) appears as a
 * participant and can interact with every proposal type.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { players, proposals, proposalParticipants } from "../drizzle/schema";

// ── Seed Players ────────────────────────────────────────────────────────────
// openId == email from lib/mock-data.ts so the local auth context and the DB
// agree on who the current user is.

const SEED_PLAYERS = [
  { openId: "yassine@example.com",       name: "Yassine Arab",      firstName: "Yassine",      lastName: "Arab",       division: "D1" as const, unoPoints: 3500, xp: 4200, level: 2, statsGoals: 39, statsAssists: 28, statsDefenses: 41, statsSaves: 52, statsMotm: 8, nationality: "Belgique",      avatar: "🏆" },
  { openId: "mohammed-reda@example.com", name: "Mohammed-Reda Oua", firstName: "Mohammed-Reda", lastName: "Oua",        division: "D1" as const, unoPoints: 3200, xp: 3900, level: 2, statsGoals: 35, statsAssists: 26, statsDefenses: 38, statsSaves: 48, statsMotm: 7, nationality: "Maroc",         avatar: "⚽" },
  { openId: "hicham@example.com",        name: "Hicham Benali",     firstName: "Hicham",       lastName: "Benali",     division: "D1" as const, unoPoints: 2800, xp: 3200, level: 2, statsGoals: 32, statsAssists: 24, statsDefenses: 35, statsSaves: 45, statsMotm: 6, nationality: "Maroc",         avatar: "🎯" },
  { openId: "fatima@example.com",        name: "Fatima Oulad",      firstName: "Fatima",       lastName: "Oulad",      division: "D1" as const, unoPoints: 3100, xp: 3700, level: 2, statsGoals: 34, statsAssists: 25, statsDefenses: 37, statsSaves: 47, statsMotm: 7, nationality: "Maroc",         avatar: "👑" },
  { openId: "rachid@example.com",        name: "Rachid Ghezzal",    firstName: "Rachid",       lastName: "Ghezzal",    division: "D1" as const, unoPoints: 2900, xp: 3400, level: 2, statsGoals: 30, statsAssists: 22, statsDefenses: 33, statsSaves: 42, statsMotm: 5, nationality: "Algérie",       avatar: "⚡" },
  { openId: "mehdi@example.com",         name: "Mehdi Taremi",      firstName: "Mehdi",        lastName: "Taremi",     division: "D1" as const, unoPoints: 3000, xp: 3500, level: 2, statsGoals: 33, statsAssists: 24, statsDefenses: 36, statsSaves: 44, statsMotm: 6, nationality: "Iran",          avatar: "🔴" },
  { openId: "karim@example.com",         name: "Karim Ziani",       firstName: "Karim",        lastName: "Ziani",      division: "D2" as const, unoPoints: 2500, xp: 2800, level: 1, statsGoals: 28, statsAssists: 20, statsDefenses: 30, statsSaves: 40, statsMotm: 5, nationality: "Algérie",       avatar: "⭐" },
  { openId: "ahmed@example.com",         name: "Ahmed Tazi",        firstName: "Ahmed",        lastName: "Tazi",       division: "D2" as const, unoPoints: 2200, xp: 2500, level: 1, statsGoals: 25, statsAssists: 18, statsDefenses: 28, statsSaves: 38, statsMotm: 4, nationality: "Maroc",         avatar: "🔥" },
  { openId: "nabil@example.com",         name: "Nabil Fekir",       firstName: "Nabil",        lastName: "Fekir",      division: "D2" as const, unoPoints: 2100, xp: 2300, level: 1, statsGoals: 22, statsAssists: 17, statsDefenses: 25, statsSaves: 33, statsMotm: 3, nationality: "France",        avatar: "🌟" },
  { openId: "sofiane@example.com",       name: "Sofiane Boufal",    firstName: "Sofiane",      lastName: "Boufal",     division: "D2" as const, unoPoints: 1900, xp: 2100, level: 1, statsGoals: 21, statsAssists: 16, statsDefenses: 23, statsSaves: 31, statsMotm: 3, nationality: "Maroc",         avatar: "🎭" },
  { openId: "amine@example.com",         name: "Amine Harit",       firstName: "Amine",        lastName: "Harit",      division: "D2" as const, unoPoints: 2000, xp: 2200, level: 1, statsGoals: 23, statsAssists: 16, statsDefenses: 24, statsSaves: 32, statsMotm: 3, nationality: "France",        avatar: "🎸" },
  { openId: "hassan@example.com",        name: "Hassan Amrani",     firstName: "Hassan",       lastName: "Amrani",     division: "D3" as const, unoPoints: 1800, xp: 2000, level: 1, statsGoals: 20, statsAssists: 15, statsDefenses: 22, statsSaves: 30, statsMotm: 3, nationality: "Belgique",      avatar: "💪" },
  { openId: "ibrahim@example.com",       name: "Ibrahim Kone",      firstName: "Ibrahim",      lastName: "Kone",       division: "D3" as const, unoPoints: 1500, xp: 1700, level: 1, statsGoals: 18, statsAssists: 13, statsDefenses: 20, statsSaves: 28, statsMotm: 2, nationality: "Côte d'Ivoire", avatar: "🎪" },
  { openId: "bilal@example.com",         name: "Bilal Cheddira",    firstName: "Bilal",        lastName: "Cheddira",   division: "D3" as const, unoPoints: 1600, xp: 1800, level: 1, statsGoals: 19, statsAssists: 14, statsDefenses: 21, statsSaves: 29, statsMotm: 2, nationality: "Belgique",      avatar: "🦁" },
  { openId: "zakaria@example.com",       name: "Zakaria Aboukhlal", firstName: "Zakaria",      lastName: "Aboukhlal",  division: "D3" as const, unoPoints: 1700, xp: 1900, level: 1, statsGoals: 17, statsAssists: 12, statsDefenses: 19, statsSaves: 27, statsMotm: 2, nationality: "Maroc",         avatar: "🌙" },
];

// D1 players (Yassine's division) — used for league proposals
const D1_PLAYERS = SEED_PLAYERS.filter((p) => p.division === "D1");

export function runSeed(): { playersUpserted: number; proposalsCreated: number; participantsCreated: number } {
  const db = getDb();
  let playersUpserted = 0;
  let proposalsCreated = 0;
  let participantsCreated = 0;

  // ── Upsert players ─────────────────────────────────────────────────────────
  for (const p of SEED_PLAYERS) {
    const existing = db.select().from(players).where(eq(players.openId, p.openId)).get();
    if (!existing) {
      db.insert(players).values(p).run();
      playersUpserted++;
    }
  }

  // ── Guard: skip if seed proposals already exist ────────────────────────────
  const existingSeed = db
    .select()
    .from(proposals)
    .where(eq(proposals.createdByOpenId, "yassine@example.com"))
    .get();

  if (existingSeed) {
    const [pCount] = db.select({ count: sql<number>`count(*)` }).from(players).all();
    const [propCount] = db.select({ count: sql<number>`count(*)` }).from(proposals).all();
    const [partCount] = db.select({ count: sql<number>`count(*)` }).from(proposalParticipants).all();
    return {
      playersUpserted: 0,
      proposalsCreated: Number(propCount?.count ?? 0),
      participantsCreated: Number(partCount?.count ?? 0),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proposal 1 — SESSION (completed, all paid)
  // Fit Five Forest · UNO League · D1 · March 7, 2026 · 18h-20h
  // Yassine and all other D1 players participated and have all paid.
  // This represents a match that has already been played.
  // ────────────────────────────────────────────────────────────────────────────
  {
    const res = db
      .insert(proposals)
      .values({
        date: new Date("2026-03-07T18:00:00"),
        time: "18h-20h",
        locationId: "fit-five-forest",
        locationName: "Fit Five Forest",
        locationColor: "#dc2626",
        modeId: "league",
        modeName: "UNO League",
        minParticipants: 15,
        price: 20,
        rewards: "500 UNO meilleur buteur · 200 UNO MOTM",
        status: "session",
        division: "D1",
        paymentComplete: true,
        createdByOpenId: "yassine@example.com",
      })
      .run();

    const proposalId = Number(res.lastInsertRowid);

    // All 15 participants, all paid — fill D1 players first, then D2 to reach 15
    const sessionPlayers = [...D1_PLAYERS, ...SEED_PLAYERS.filter((p) => p.division === "D2")].slice(0, 15);
    for (const p of sessionPlayers) {
      db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid: true,
      }).run();
      participantsCreated++;
    }
    proposalsCreated++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proposal 2 — RESERVATION (full, awaiting payment)
  // Fit Five Forest · UNO League · D1 · March 15, 2026 · 20h-22h
  // 15 D1 players joined → auto-advanced to reservation.
  // 9 have already paid; Yassine has NOT paid yet → "Payer ma place" visible.
  // ────────────────────────────────────────────────────────────────────────────
  {
    const res = db
      .insert(proposals)
      .values({
        date: new Date("2026-03-15T20:00:00"),
        time: "20h-22h",
        locationId: "fit-five-forest",
        locationName: "Fit Five Forest",
        locationColor: "#dc2626",
        modeId: "league",
        modeName: "UNO League",
        minParticipants: 15,
        price: 20,
        rewards: "500 UNO meilleur buteur · 200 UNO MOTM",
        status: "reservation",
        division: "D1",
        paymentComplete: false,
        createdByOpenId: "yassine@example.com",
      })
      .run();

    const proposalId = Number(res.lastInsertRowid);

    const reservationPlayers = [...D1_PLAYERS, ...SEED_PLAYERS.filter((p) => p.division === "D2")].slice(0, 15);
    reservationPlayers.forEach((p, i) => {
      // Yassine is index 0 and has NOT paid; others 1-8 have paid; 9-14 have not
      const hasPaid = p.openId !== "yassine@example.com" && i < 9;
      db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid,
      }).run();
      participantsCreated++;
    });
    proposalsCreated++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proposal 3 — PROPOSITION (open, looking for more players)
  // Fit Five Forest · UNO League · D1 · March 22, 2026 · 18h-20h
  // 8 players registered so far, 7 more needed (min 15).
  // Yassine is one of the 8.
  // ────────────────────────────────────────────────────────────────────────────
  {
    const res = db
      .insert(proposals)
      .values({
        date: new Date("2026-03-22T18:00:00"),
        time: "18h-20h",
        locationId: "fit-five-forest",
        locationName: "Fit Five Forest",
        locationColor: "#dc2626",
        modeId: "league",
        modeName: "UNO League",
        minParticipants: 15,
        price: 20,
        rewards: "500 UNO meilleur buteur · 200 UNO MOTM",
        status: "proposition",
        division: "D1",
        paymentComplete: false,
        createdByOpenId: "yassine@example.com",
      })
      .run();

    const proposalId = Number(res.lastInsertRowid);

    const propPlayers = D1_PLAYERS.slice(0, 8); // 8 out of 15 joined
    for (const p of propPlayers) {
      db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid: false,
      }).run();
      participantsCreated++;
    }
    proposalsCreated++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proposal 4 — PROPOSITION (open)
  // Fit Five Forest · Match amical · March 18, 2026 · 14h-15h
  // 4 players registered (Yassine included), needs 10 total.
  // ────────────────────────────────────────────────────────────────────────────
  {
    const res = db
      .insert(proposals)
      .values({
        date: new Date("2026-03-18T14:00:00"),
        time: "14h-15h",
        locationId: "fit-five-forest",
        locationName: "Fit Five Forest",
        locationColor: "#dc2626",
        modeId: "friendly",
        modeName: "Match amical",
        minParticipants: 10,
        price: 10,
        rewards: "100 UNO par participant",
        status: "proposition",
        division: "D1",
        paymentComplete: false,
        createdByOpenId: "yassine@example.com",
      })
      .run();

    const proposalId = Number(res.lastInsertRowid);

    const friendlyPlayers = SEED_PLAYERS.slice(0, 4);
    for (const p of friendlyPlayers) {
      db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid: false,
      }).run();
      participantsCreated++;
    }
    proposalsCreated++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proposal 5 — RESERVATION (open reservation)
  // Fit Five Forest · Match amical · March 25, 2026 · 20h-21h
  // 10 players (Yassine included), 4 have paid (not Yassine).
  // ────────────────────────────────────────────────────────────────────────────
  {
    const res = db
      .insert(proposals)
      .values({
        date: new Date("2026-03-25T20:00:00"),
        time: "20h-21h",
        locationId: "fit-five-forest",
        locationName: "Fit Five Forest",
        locationColor: "#dc2626",
        modeId: "friendly",
        modeName: "Match amical",
        minParticipants: 10,
        price: 10,
        rewards: "100 UNO par participant",
        status: "reservation",
        division: "D1",
        paymentComplete: false,
        createdByOpenId: "yassine@example.com",
      })
      .run();

    const proposalId = Number(res.lastInsertRowid);

    const reservationPlayers = SEED_PLAYERS.slice(0, 10);
    reservationPlayers.forEach((p, i) => {
      const hasPaid = p.openId !== "yassine@example.com" && i >= 1 && i <= 4;
      db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid,
      }).run();
      participantsCreated++;
    });
    proposalsCreated++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Proposal 6 — PROPOSITION
  // YC Five · UNO League · D1 · March 20, 2026 · 18h-20h
  // 5 players (Yassine included), needs 10 more.
  // ────────────────────────────────────────────────────────────────────────────
  {
    const res = db
      .insert(proposals)
      .values({
        date: new Date("2026-03-20T18:00:00"),
        time: "18h-20h",
        locationId: "yc-five",
        locationName: "YC Five",
        locationColor: "#334155",
        modeId: "league",
        modeName: "UNO League",
        minParticipants: 15,
        price: 20,
        rewards: "500 UNO meilleur buteur · 200 UNO MOTM",
        status: "proposition",
        division: "D1",
        paymentComplete: false,
        createdByOpenId: "yassine@example.com",
      })
      .run();

    const proposalId = Number(res.lastInsertRowid);

    const ycPlayers = D1_PLAYERS.slice(0, 5);
    for (const p of ycPlayers) {
      db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid: false,
      }).run();
      participantsCreated++;
    }
    proposalsCreated++;
  }

  // ── Final counts ───────────────────────────────────────────────────────────
  const [propCount] = db.select({ count: sql<number>`count(*)` }).from(proposals).all();
  const [partCount] = db.select({ count: sql<number>`count(*)` }).from(proposalParticipants).all();

  return {
    playersUpserted,
    proposalsCreated: Number(propCount?.count ?? 0),
    participantsCreated: Number(partCount?.count ?? 0),
  };
}
