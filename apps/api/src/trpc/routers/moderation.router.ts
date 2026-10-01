import { z } from "zod";
import {
  REPORT_STATUSES,
  blockPlayerSchema,
  reportContentSchema,
} from "@uno/shared";
import {
  blockPlayer,
  listBlocked,
  listReports,
  reportContent,
  resolveReport,
  unblockPlayer,
} from "../../services/moderation.service.js";
import { adminProcedure, protectedProcedure, router } from "../init.js";

/**
 * Signaler, bloquer, et traiter les signalements (MOD-001).
 *
 * Les trois premières routes appartiennent à chaque joueur ; les deux
 * dernières à l'administration seule — le contrôle est fait ici, côté
 * serveur, et non par l'écran qui les appelle.
 */
export const moderationRouter = router({
  report: protectedProcedure
    .input(reportContentSchema)
    .mutation(({ ctx, input }) =>
      reportContent({ playerId: ctx.identity.playerId }, input),
    ),

  block: protectedProcedure
    .input(blockPlayerSchema)
    .mutation(({ ctx, input }) =>
      blockPlayer({ playerId: ctx.identity.playerId }, input.playerId),
    ),

  unblock: protectedProcedure
    .input(blockPlayerSchema)
    .mutation(({ ctx, input }) =>
      unblockPlayer({ playerId: ctx.identity.playerId }, input.playerId),
    ),

  blocked: protectedProcedure.query(({ ctx }) =>
    listBlocked(ctx.identity.playerId),
  ),

  reports: adminProcedure
    .input(
      z.object({
        status: z.enum([...REPORT_STATUSES, "all"]).default("open"),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(({ input }) => listReports(input)),

  resolve: adminProcedure
    .input(
      z.object({
        reportId: z.number().int().positive(),
        action: z.enum(["remove", "dismiss"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      resolveReport(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input.reportId,
        input.action,
      ),
    ),
});
