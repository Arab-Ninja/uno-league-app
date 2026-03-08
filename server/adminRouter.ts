import { sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users, players, proposals, proposalParticipants, transactions, teams, matches, shopItems } from "../drizzle/schema";
import { runSeed } from "./seed";

export const adminRouter = router({
  /**
   * Returns live row counts for every main table and the 5 most-recently
   * created entries in each table.
   */
  dbStats: publicProcedure.query(async () => {
    try {
      const db = getDb();

      const [
        userCounts,
        playerCounts,
        proposalCounts,
        participantCounts,
        transactionCounts,
        teamCounts,
        matchCounts,
        shopCounts,
        recentPlayers,
        recentProposals,
        recentTransactions,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(players),
        db.select({ count: sql<number>`count(*)` }).from(proposals),
        db.select({ count: sql<number>`count(*)` }).from(proposalParticipants),
        db.select({ count: sql<number>`count(*)` }).from(transactions),
        db.select({ count: sql<number>`count(*)` }).from(teams),
        db.select({ count: sql<number>`count(*)` }).from(matches),
        db.select({ count: sql<number>`count(*)` }).from(shopItems),
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
          .limit(5),
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
          .limit(5),
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
          .limit(5),
      ]);

      const userCount = userCounts[0];
      const playerCount = playerCounts[0];
      const proposalCount = proposalCounts[0];
      const participantCount = participantCounts[0];
      const transactionCount = transactionCounts[0];
      const teamCount = teamCounts[0];
      const matchCount = matchCounts[0];
      const shopCount = shopCounts[0];

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
  listShopItems: publicProcedure.query(async () => {
    const db = getDb();
    return await db.select().from(shopItems).orderBy(desc(shopItems.createdAt));
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
    .mutation(async ({ input }) => {
      const db = getDb();
      const [inserted] = await db
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
        .$returningId();
      const rows = await db.select().from(shopItems).where(eq(shopItems.id, inserted.id));
      return rows[0] ?? null;
    }),

  /** Deletes a shop item by its numeric id. */
  deleteShopItem: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db
        .select({ id: shopItems.id })
        .from(shopItems)
        .where(eq(shopItems.id, input.id));
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produit introuvable" });
      }
      await db.delete(shopItems).where(eq(shopItems.id, input.id));
      return { success: true };
    }),

  /** Updates a shop item. */
  updateShopItem: publicProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        priceUno: z.number().int().positive().optional(),
        images: z.array(z.string()).optional(),
        category: z
          .enum(["headphones", "watches", "shoes", "clothes", "accessories", "other"])
          .optional(),
        productUrl: z.string().optional(),
        available: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.priceUno !== undefined) updateData.priceUno = updates.priceUno;
      if (updates.images !== undefined) updateData.images = JSON.stringify(updates.images);
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.productUrl !== undefined) updateData.productUrl = updates.productUrl;
      if (updates.available !== undefined) updateData.available = updates.available;

      await db.update(shopItems).set(updateData).where(eq(shopItems.id, id));
      const rows = await db.select().from(shopItems).where(eq(shopItems.id, id));
      return rows[0] ?? null;
    }),

  /** Get all players (for admin management). */
  listPlayers: publicProcedure.query(async () => {
    const db = getDb();
    return await db.select().from(players).orderBy(desc(players.createdAt));
  }),

  /** Update a player (admin only). */
  updatePlayer: publicProcedure
    .input(
      z.object({
        openId: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        division: z.enum(["D1", "D2", "D3"]).optional(),
        unoPoints: z.number().optional(),
        xp: z.number().optional(),
        level: z.number().optional(),
        statsGoals: z.number().optional(),
        statsAssists: z.number().optional(),
        statsDefenses: z.number().optional(),
        statsSaves: z.number().optional(),
        statsMotm: z.number().optional(),
        nationality: z.string().optional(),
        dateOfBirth: z.string().optional(),
        profilePhoto: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { openId, ...updates } = input;

      const updateData: Record<string, unknown> = {};
      if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
      if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.address !== undefined) updateData.address = updates.address;
      if (updates.division !== undefined) updateData.division = updates.division;
      if (updates.unoPoints !== undefined) updateData.unoPoints = updates.unoPoints;
      if (updates.xp !== undefined) updateData.xp = updates.xp;
      if (updates.level !== undefined) updateData.level = updates.level;
      if (updates.statsGoals !== undefined) updateData.statsGoals = updates.statsGoals;
      if (updates.statsAssists !== undefined) updateData.statsAssists = updates.statsAssists;
      if (updates.statsDefenses !== undefined) updateData.statsDefenses = updates.statsDefenses;
      if (updates.statsSaves !== undefined) updateData.statsSaves = updates.statsSaves;
      if (updates.statsMotm !== undefined) updateData.statsMotm = updates.statsMotm;
      if (updates.nationality !== undefined) updateData.nationality = updates.nationality;
      if (updates.dateOfBirth !== undefined) updateData.dateOfBirth = updates.dateOfBirth;
      if (updates.profilePhoto !== undefined) updateData.profilePhoto = updates.profilePhoto;

      await db.update(players).set(updateData).where(eq(players.openId, openId));
      const rows = await db.select().from(players).where(eq(players.openId, openId));
      return rows[0] ?? null;
    }),

  /** Delete a player (admin only). */
  deletePlayer: publicProcedure
    .input(z.object({ openId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(players).where(eq(players.openId, input.openId));
      return { success: true };
    }),

  /** Get all proposals (for admin management). */
  listProposals: publicProcedure.query(async () => {
    const db = getDb();
    const proposalsList = await db.select().from(proposals).orderBy(desc(proposals.createdAt));
    return await Promise.all(
      proposalsList.map(async (p) => {
        const parts = await db
          .select()
          .from(proposalParticipants)
          .where(eq(proposalParticipants.proposalId, p.id));
        return { ...p, participants: parts };
      }),
    );
  }),

  /** Delete a proposal (admin only). */
  deleteProposal: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(proposalParticipants).where(eq(proposalParticipants.proposalId, input.id));
      await db.delete(proposals).where(eq(proposals.id, input.id));
      return { success: true };
    }),

  /**
   * Seeds the database with 15 fictional players and demo proposals.
   * Idempotent: safe to call multiple times.
   */
  seedTestData: publicProcedure.mutation(async () => {
    const result = await runSeed();
    return {
      playersCreated: result.playersUpserted,
      proposalsCreated: result.proposalsCreated,
      participantsCreated: result.participantsCreated,
    };
  }),
});
