import { sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
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
        /** Array of image URLs. */
        images: z.array(z.string().url()).default([]),
        category: z
          .enum(["headphones", "watches", "shoes", "clothes", "accessories", "other"])
          .optional(),
        productUrl: z.string().url().optional(),
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
      db.delete(shopItems).where(eq(shopItems.id, input.id)).run();
      return { success: true };
    }),
});
