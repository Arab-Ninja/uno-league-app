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
      const db = getDb();
      const [player] = await db.select().from(players).where(eq(players.openId, input.openId));
      return player ?? null;
    }),

  /** Upsert player profile (create on first login, update on profile edit). */
  upsert: publicProcedure
    .input(
      z.object({
        openId: z.string(),
        name: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
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
      const db = getDb();

      const { openId, goals, assists, defenses, saves, motm, ...rest } = input;

      // Map old stat field names to new schema names
      const statFields = {
        ...(goals !== undefined ? { statsGoals: goals } : {}),
        ...(assists !== undefined ? { statsAssists: assists } : {}),
        ...(defenses !== undefined ? { statsDefenses: defenses } : {}),
        ...(saves !== undefined ? { statsSaves: saves } : {}),
        ...(motm !== undefined ? { statsMotm: motm } : {}),
      };

      const insertValues = { openId, ...rest, ...statFields };
      const updateValues = { ...rest, ...statFields };

      const [existing] = await db.select().from(players).where(eq(players.openId, openId));
      if (existing) {
        await db.update(players).set(updateValues).where(eq(players.openId, openId));
      } else {
        await db.insert(players).values(insertValues);
      }

      const [updated] = await db.select().from(players).where(eq(players.openId, openId));
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
      const db = getDb();

      const [current] = await db.select().from(players).where(eq(players.openId, input.openId));
      if (!current) return null;

      const newPoints = Math.max(0, current.unoPoints + input.delta);
      await db.update(players).set({ unoPoints: newPoints }).where(eq(players.openId, input.openId));

      // Record the transaction
      await db.insert(transactions)
        .values({
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
      const db = getDb();
      return db.select().from(transactions).where(eq(transactions.playerOpenId, input.openId));
    }),

  /** Get all players (for ranking). */
  list: publicProcedure.query(async () => {
    const db = getDb();
    return db.select().from(players);
  }),
});

