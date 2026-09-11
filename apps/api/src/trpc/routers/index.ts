import { router } from "../init.js";
import { adminRouter } from "./admin.router.js";
import { announcementsRouter } from "./announcements.router.js";
import { authRouter } from "./auth.router.js";
import { playersRouter } from "./players.router.js";
import { proposalsRouter } from "./proposals.router.js";
import { rankingRouter } from "./ranking.router.js";
import { shopRouter } from "./shop.router.js";
import { supervisionRouter } from "./supervision.router.js";
import { squadsRouter } from "./squads.router.js";
import { trackerRouter } from "./tracker.router.js";
import { walletRouter } from "./wallet.router.js";

/** Contrat d'API typé de bout en bout (CDC §18). */
export const appRouter = router({
  auth: authRouter,
  players: playersRouter,
  proposals: proposalsRouter,
  wallet: walletRouter,
  shop: shopRouter,
  ranking: rankingRouter,
  announcements: announcementsRouter,
  supervision: supervisionRouter,
  admin: adminRouter,
  tracker: trackerRouter,
  squads: squadsRouter,
});

export type AppRouter = typeof appRouter;
