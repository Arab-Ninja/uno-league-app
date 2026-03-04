import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { players, transactions } from "../drizzle/schema";

export const playersRouter = router({
  /** Get player profile by openId (email used as openId in the mock auth). */
  get: publicProcedure
    .input(z.object({ openId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(players).where(eq(players.openId, input.openId)).limit(1);
      return result[0] ?? null;
    }),

  /** Upsert player profile (create on first login, update on profile edit). */
  upsert: publicProcedure
    .input(
      z.object({
        openId: z.string(),
        name: z.string(),
        email: z.string().optional(),
        division: z.enum(["D1", "D2", "D3"]).optional(),
        unoPoints: z.number().optional(),
        xp: z.number().optional(),
        level: z.number().optional(),
        goals: z.number().optional(),
        assists: z.number().optional(),
        defenses: z.number().optional(),
        saves: z.number().optional(),
        motm: z.number().optional(),
        avatar: z.string().optional(),
        nationality: z.string().optional(),
        dateOfBirth: z.string().optional(),
        profilePhoto: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const { openId, ...rest } = input;

      await db
        .insert(players)
        .values({ openId, ...rest })
        .onDuplicateKeyUpdate({ set: rest });

      const [updated] = await db.select().from(players).where(eq(players.openId, openId)).limit(1);
      return updated ?? null;
    }),

  /** Update UNO points for a player (delta). */
  addPoints: publicProcedure
    .input(
      z.object({
        openId: z.string(),
        delta: z.number(),
        description: z.string(),
        type: z.enum(["send", "receive", "purchase", "reward"]),
        fromOpenId: z.string().optional(),
        toOpenId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [current] = await db.select().from(players).where(eq(players.openId, input.openId)).limit(1);
      if (!current) return null;

      const newPoints = Math.max(0, current.unoPoints + input.delta);
      await db.update(players).set({ unoPoints: newPoints }).where(eq(players.openId, input.openId));

      // Record the transaction
      await db.insert(transactions).values({
        playerOpenId: input.openId,
        type: input.type,
        amount: input.delta,
        fromPlayerOpenId: input.fromOpenId,
        toPlayerOpenId: input.toOpenId,
        description: input.description,
      });

      return { unoPoints: newPoints };
    }),

  /** Get transaction history for a player. */
  transactions: publicProcedure
    .input(z.object({ openId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(transactions).where(eq(transactions.playerOpenId, input.openId));
    }),

  /** Get all players (for ranking). */
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(players);
  }),
});
