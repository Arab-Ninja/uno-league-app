import { sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users, players, proposals, proposalParticipants, transactions, teams, matches, shopItems } from "../drizzle/schema";

export const adminRouter = router({
  /**
   * Returns live row counts for every main table and the 5 most-recently
   * created entries in each table.
   *
   * SQLite is always available (file-based), so this always returns connected: true
   * unless there's an unexpected runtime error.
   *
   * Access is gated by the admin password check in the UI (app/admin.tsx).
   */
  dbStats: publicProcedure.query(() => {
    try {
      const db = getDb();

      const [
        [userCount],
        [playerCount],
        [proposalCount],
        [participantCount],
        [transactionCount],
        [teamCount],
        [matchCount],
        [shopCount],
        recentPlayers,
        recentProposals,
        recentTransactions,
      ] = [
        db.select({ count: sql<number>`count(*)` }).from(users).all(),
        db.select({ count: sql<number>`count(*)` }).from(players).all(),
        db.select({ count: sql<number>`count(*)` }).from(proposals).all(),
        db.select({ count: sql<number>`count(*)` }).from(proposalParticipants).all(),
        db.select({ count: sql<number>`count(*)` }).from(transactions).all(),
        db.select({ count: sql<number>`count(*)` }).from(teams).all(),
        db.select({ count: sql<number>`count(*)` }).from(matches).all(),
        db.select({ count: sql<number>`count(*)` }).from(shopItems).all(),
        db
          .select({
            id: players.id,
            name: players.name,
            division: players.division,
            unoPoints: players.unoPoints,
            createdAt: players.createdAt,
          })
          .from(players)
          .orderBy(desc(players.createdAt))
          .limit(5)
          .all(),
        db
          .select({
            id: proposals.id,
            locationName: proposals.locationName,
            modeName: proposals.modeName,
            time: proposals.time,
            status: proposals.status,
            date: proposals.date,
            createdAt: proposals.createdAt,
          })
          .from(proposals)
          .orderBy(desc(proposals.createdAt))
          .limit(5)
          .all(),
        db
          .select({
            id: transactions.id,
            playerOpenId: transactions.playerOpenId,
            type: transactions.type,
            amount: transactions.amount,
            description: transactions.description,
            createdAt: transactions.createdAt,
          })
          .from(transactions)
          .orderBy(desc(transactions.createdAt))
          .limit(5)
          .all(),
      ];

      return {
        connected: true,
        counts: {
          users: Number(userCount?.count ?? 0),
          players: Number(playerCount?.count ?? 0),
          proposals: Number(proposalCount?.count ?? 0),
          participants: Number(participantCount?.count ?? 0),
          transactions: Number(transactionCount?.count ?? 0),
          teams: Number(teamCount?.count ?? 0),
          matches: Number(matchCount?.count ?? 0),
          shopItems: Number(shopCount?.count ?? 0),
        },
        recent: {
          players: recentPlayers,
          proposals: recentProposals,
          transactions: recentTransactions,
        },
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
        counts: null,
        recent: null,
      };
    }
  }),

  /** Returns all shop items ordered by newest first. */
  listShopItems: publicProcedure.query(() => {
    const db = getDb();
    return db.select().from(shopItems).orderBy(desc(shopItems.createdAt)).all();
  }),

  /** Creates a new shop item and persists it to the database. */
  addShopItem: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        priceUno: z.number().int().positive(),
        /** Array of image URLs (validated client-side). */
        images: z.array(z.string()).default([]),
        category: z
          .enum(["headphones", "watches", "shoes", "clothes", "accessories", "other"])
          .optional(),
        productUrl: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDb();
      const [created] = db
        .insert(shopItems)
        .values({
          name: input.name,
          description: input.description ?? null,
          priceUno: input.priceUno,
          images: JSON.stringify(input.images),
          category: input.category ?? null,
          productUrl: input.productUrl ?? null,
          available: true,
        })
        .returning()
        .all();
      return created;
    }),

  /** Deletes a shop item by its numeric id. */
  deleteShopItem: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ input }) => {
      const db = getDb();
      const [existing] = db
        .select({ id: shopItems.id })
        .from(shopItems)
        .where(eq(shopItems.id, input.id))
        .all();
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produit introuvable" });
      }
      db.delete(shopItems).where(eq(shopItems.id, input.id)).run();
      return { success: true };
    }),

  /**
   * Seeds the database with 15 fictional players and 2 pre-built proposals
   * (one reservation with 10 players + 3 already paid, one proposition with
   * 5 players still open).  Idempotent: if the seed players already exist
   * they are skipped; only missing ones are inserted.
   */
  seedTestData: publicProcedure.mutation(() => {
    const db = getDb();

    // ── 15 fictional players ──────────────────────────────────────────────────
    const SEED_PLAYERS = [
      { openId: "seed@yassine.be",       name: "Yassine Arab",      firstName: "Yassine",    lastName: "Arab",      division: "D1" as const, unoPoints: 3500, xp: 4200, level: 2, statsGoals: 39, statsAssists: 28, statsDefenses: 41, statsSaves: 52, statsMotm: 8,  nationality: "Belgique",  avatar: "🏆" },
      { openId: "seed@mohammed-reda.be", name: "Mohammed-Reda Oua", firstName: "Mohammed-Reda",lastName: "Oua",     division: "D1" as const, unoPoints: 3200, xp: 3900, level: 2, statsGoals: 35, statsAssists: 26, statsDefenses: 38, statsSaves: 48, statsMotm: 7,  nationality: "Maroc",     avatar: "⚽" },
      { openId: "seed@hicham.be",        name: "Hicham Benali",     firstName: "Hicham",     lastName: "Benali",   division: "D1" as const, unoPoints: 2800, xp: 3200, level: 2, statsGoals: 32, statsAssists: 24, statsDefenses: 35, statsSaves: 45, statsMotm: 6,  nationality: "Maroc",     avatar: "🎯" },
      { openId: "seed@karim.be",         name: "Karim Ziani",       firstName: "Karim",      lastName: "Ziani",    division: "D2" as const, unoPoints: 2500, xp: 2800, level: 1, statsGoals: 28, statsAssists: 20, statsDefenses: 30, statsSaves: 40, statsMotm: 5,  nationality: "Algérie",   avatar: "⭐" },
      { openId: "seed@ahmed.be",         name: "Ahmed Tazi",        firstName: "Ahmed",      lastName: "Tazi",     division: "D2" as const, unoPoints: 2200, xp: 2500, level: 1, statsGoals: 25, statsAssists: 18, statsDefenses: 28, statsSaves: 38, statsMotm: 4,  nationality: "Maroc",     avatar: "🔥" },
      { openId: "seed@hassan.be",        name: "Hassan Amrani",     firstName: "Hassan",     lastName: "Amrani",   division: "D3" as const, unoPoints: 1800, xp: 2000, level: 1, statsGoals: 20, statsAssists: 15, statsDefenses: 22, statsSaves: 30, statsMotm: 3,  nationality: "Belgique",  avatar: "💪" },
      { openId: "seed@ibrahim.be",       name: "Ibrahim Kone",      firstName: "Ibrahim",    lastName: "Kone",     division: "D3" as const, unoPoints: 1500, xp: 1700, level: 1, statsGoals: 18, statsAssists: 13, statsDefenses: 20, statsSaves: 28, statsMotm: 2,  nationality: "Côte d'Ivoire", avatar: "🎪" },
      { openId: "seed@fatima.be",        name: "Fatima Oulad",      firstName: "Fatima",     lastName: "Oulad",    division: "D1" as const, unoPoints: 3100, xp: 3700, level: 2, statsGoals: 34, statsAssists: 25, statsDefenses: 37, statsSaves: 47, statsMotm: 7,  nationality: "Maroc",     avatar: "👑" },
      { openId: "seed@nabil.be",         name: "Nabil Fekir",       firstName: "Nabil",      lastName: "Fekir",    division: "D2" as const, unoPoints: 2100, xp: 2300, level: 1, statsGoals: 22, statsAssists: 17, statsDefenses: 25, statsSaves: 33, statsMotm: 3,  nationality: "France",    avatar: "🌟" },
      { openId: "seed@rachid.be",        name: "Rachid Ghezzal",    firstName: "Rachid",     lastName: "Ghezzal",  division: "D1" as const, unoPoints: 2900, xp: 3400, level: 2, statsGoals: 30, statsAssists: 22, statsDefenses: 33, statsSaves: 42, statsMotm: 5,  nationality: "Algérie",   avatar: "⚡" },
      { openId: "seed@sofiane.be",       name: "Sofiane Boufal",    firstName: "Sofiane",    lastName: "Boufal",   division: "D2" as const, unoPoints: 1900, xp: 2100, level: 1, statsGoals: 21, statsAssists: 16, statsDefenses: 23, statsSaves: 31, statsMotm: 3,  nationality: "Maroc",     avatar: "🎭" },
      { openId: "seed@bilal.be",         name: "Bilal Cheddira",    firstName: "Bilal",      lastName: "Cheddira", division: "D3" as const, unoPoints: 1600, xp: 1800, level: 1, statsGoals: 19, statsAssists: 14, statsDefenses: 21, statsSaves: 29, statsMotm: 2,  nationality: "Belgique",  avatar: "🦁" },
      { openId: "seed@mehdi.be",         name: "Mehdi Taremi",      firstName: "Mehdi",      lastName: "Taremi",   division: "D1" as const, unoPoints: 3000, xp: 3500, level: 2, statsGoals: 33, statsAssists: 24, statsDefenses: 36, statsSaves: 44, statsMotm: 6,  nationality: "Iran",      avatar: "🔴" },
      { openId: "seed@amine.be",         name: "Amine Harit",       firstName: "Amine",      lastName: "Harit",    division: "D2" as const, unoPoints: 2000, xp: 2200, level: 1, statsGoals: 23, statsAssists: 16, statsDefenses: 24, statsSaves: 32, statsMotm: 3,  nationality: "France",    avatar: "🎸" },
      { openId: "seed@zakaria.be",       name: "Zakaria Aboukhlal", firstName: "Zakaria",    lastName: "Aboukhlal",division: "D3" as const, unoPoints: 1700, xp: 1900, level: 1, statsGoals: 17, statsAssists: 12, statsDefenses: 19, statsSaves: 27, statsMotm: 2,  nationality: "Maroc",     avatar: "🌙" },
    ];

    // Insert players that don't exist yet
    for (const p of SEED_PLAYERS) {
      const existing = db.select().from(players).where(eq(players.openId, p.openId)).get();
      if (!existing) {
        db.insert(players).values(p).run();
      }
    }

    // ── Reservation (10 joueurs, 3 ont payé) ─────────────────────────────────
    // Only create if no seed reservations exist yet
    const existingReservation = db
      .select()
      .from(proposals)
      .where(eq(proposals.createdByOpenId, "seed@yassine.be"))
      .get();

    if (!existingReservation) {
      // Reservation: Fit Five Forest, UNO League, D1, 2026-03-15 18:00, 10 joueurs
      const reservationDate = new Date("2026-03-15T18:00:00");
      const reservationResult = db
        .insert(proposals)
        .values({
          date: reservationDate,
          time: "18:00",
          locationId: "fit-five-forest",
          locationName: "Fit Five Forest",
          locationColor: "#166534",
          modeId: "league",
          modeName: "UNO League",
          minParticipants: 10,
          price: 20,
          rewards: "500 UNO pour le meilleur buteur · 200 UNO MOTM",
          status: "reservation",
          division: "D1",
          paymentComplete: false,
          createdByOpenId: "seed@yassine.be",
        })
        .run();

      const reservationId = Number(reservationResult.lastInsertRowid);

      // 10 participants for the reservation — first 3 have already paid
      const reservationParticipants = SEED_PLAYERS.slice(0, 10).map((p, i) => ({
        proposalId: reservationId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid: i < 3,
      }));
      for (const part of reservationParticipants) {
        db.insert(proposalParticipants).values(part).run();
      }

      // Proposition: Fit Five Laeken, Match amical, D2, 2026-03-20 20:00, 5 joueurs (still open)
      const propositionDate = new Date("2026-03-20T20:00:00");
      const propositionResult = db
        .insert(proposals)
        .values({
          date: propositionDate,
          time: "20:00",
          locationId: "fit-five-laeken",
          locationName: "Fit Five Laeken",
          locationColor: "#1e40af",
          modeId: "friendly",
          modeName: "Match amical",
          minParticipants: 10,
          price: 10,
          rewards: "100 UNO par participant",
          status: "proposition",
          division: "D2",
          paymentComplete: false,
          createdByOpenId: "seed@karim.be",
        })
        .run();

      const propositionId = Number(propositionResult.lastInsertRowid);

      // 5 participants — still waiting for 5 more to trigger reservation
      const propositionParticipants = [
        SEED_PLAYERS[3], // Karim
        SEED_PLAYERS[4], // Ahmed
        SEED_PLAYERS[8], // Nabil
        SEED_PLAYERS[10], // Sofiane
        SEED_PLAYERS[13], // Amine
      ].map((p) => ({
        proposalId: propositionId,
        playerOpenId: p.openId,
        playerName: p.name,
        hasPaid: false,
      }));
      for (const part of propositionParticipants) {
        db.insert(proposalParticipants).values(part).run();
      }
    }

    // Final counts
    const [playerCount] = db.select({ count: sql<number>`count(*)` }).from(players).all();
    const [proposalCount] = db.select({ count: sql<number>`count(*)` }).from(proposals).all();
    const [participantCount] = db.select({ count: sql<number>`count(*)` }).from(proposalParticipants).all();

    return {
      playersCreated: Number(playerCount?.count ?? 0),
      proposalsCreated: Number(proposalCount?.count ?? 0),
      participantsCreated: Number(participantCount?.count ?? 0),
    };
  }),
});
