import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { proposalsRouter } from "./proposalsRouter";
import { playersRouter } from "./playersRouter";
import { adminRouter } from "./adminRouter";
import { getDb } from "./db";
import { shopItems } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const shopRouter = router({
  /** Returns all available shop items ordered by newest first. */
  listItems: publicProcedure.query(async () => {
    try {
      const db = getDb();
      return await db
        .select()
        .from(shopItems)
        .where(eq(shopItems.available, true))
        .orderBy(desc(shopItems.createdAt));
    } catch (error) {
      console.error("[shop.listItems]", error);
      return [];
    }
  }),
});

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  proposals: proposalsRouter,
  players: playersRouter,
  admin: adminRouter,
  shop: shopRouter,
});

export type AppRouter = typeof appRouter;
