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
   *
   * SQLite is always available (file-based), so this always returns connected: true
   * unless there's an unexpected runtime error.
   *
   * Access is gated by the admin password check in the UI (app/admin.tsx).
   */
  dbStats: publicProcedure.query(async () => {
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
    return db.select().from(shopItems).orderBy(desc(shopItems.createdAt));
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
      const inserted = await db
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
      const [created] = await db
        .select()
        .from(shopItems)
        .where(eq(shopItems.id, inserted[0].id));
      return created;
    }),

  /** Deletes a shop item by its numeric id. */
  deleteShopItem: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [existing] = await db
        .select({ id: shopItems.id })
        .from(shopItems)
        .where(eq(shopItems.id, input.id));
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produit introuvable" });
      }
      await db.delete(shopItems).where(eq(shopItems.id, input.id));
      return { success: true };
    }),

  /**
   * Seeds the database with 15 fictional players and demo proposals
   * (proposition, reservation, session) across multiple locations.
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
