import { RANKING_FORMULA_VERSION, RANKING_WEIGHTS, rankingSchema } from "@uno/shared";
import { db } from "../../db/client.js";
import { leaderboard, playerPosition } from "../../services/ranking.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

export const rankingRouter = router({
  /**
   * Classement d'une division (RANK-001, RANK-002).
   * Le tri et le départage sont faits côté serveur (P-004, RANK-003).
   */
  list: protectedProcedure.input(rankingSchema).query(async ({ ctx, input }) => {
    const [entries, position] = await Promise.all([
      leaderboard(db, input),
      playerPosition(db, {
        playerId: ctx.identity.playerId,
        division: input.division,
        sort: input.sort,
      }),
    ]);
    return { entries, viewerPosition: position };
  }),

  /** Formule de départage exposée pour transparence (RANK-003). */
  formula: publicProcedure.query(() => ({
    version: RANKING_FORMULA_VERSION,
    weights: RANKING_WEIGHTS,
    tieBreak: [
      "critère de tri sélectionné, décroissant",
      "points de classement général, décroissants",
      "nom d'affichage croissant",
      "identifiant joueur croissant",
    ],
  })),
});
