import { z } from "zod";
import {
  GAME_MODES,
  VENUES,
  createProposalSchema,
  generateSlots,
  listProposalsSchema,
  payProposalSchema,
  proposalIdSchema,
  requireSchedulableMode,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import { availablePaymentMethods } from "../../payments/index.js";
import { payProposal } from "../../services/payments.service.js";
import * as proposalsService from "../../services/proposals.service.js";
import { listMatches } from "../../services/matches.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";
import { eq } from "drizzle-orm";
import { AppError } from "@uno/shared";

/** Récupère la division du joueur : elle conditionne ce qu'il peut voir. */
async function viewerDivision(playerId: number) {
  const [player] = await db
    .select({ division: players.division })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!player) throw new AppError("NOT_FOUND", "Profil introuvable.");
  return player.division;
}

export const proposalsRouter = router({
  /**
   * Référentiel du calendrier : modes, lieux, créneaux et moyens de paiement
   * réellement disponibles. L'interface ne code aucune de ces valeurs en dur
   * (INFO-001, MODE-001).
   */
  config: publicProcedure.query(() => ({
    modes: GAME_MODES.map((mode) => ({
      ...mode,
      slots: mode.schedulable ? generateSlots(mode) : [],
    })),
    venues: VENUES,
    paymentMethods: availablePaymentMethods(),
  })),

  list: protectedProcedure
    .input(listProposalsSchema)
    .query(async ({ ctx, input }) =>
      proposalsService.listProposals(
        {
          playerId: ctx.identity.playerId,
          division: await viewerDivision(ctx.identity.playerId),
        },
        input,
      ),
    ),

  get: protectedProcedure
    .input(proposalIdSchema)
    .query(({ ctx, input }) =>
      proposalsService.getProposal(
        { playerId: ctx.identity.playerId },
        input.proposalId,
      ),
    ),

  /** Détail enrichi des équipes et matchs, lorsqu'ils existent. */
  matches: protectedProcedure
    .input(proposalIdSchema)
    .query(({ input }) => listMatches(db, input.proposalId)),

  create: protectedProcedure
    .input(createProposalSchema)
    .mutation(({ ctx, input }) => {
      // Le mode doit être planifiable : un mode « bientôt disponible » ne
      // déclenche aucun parcours de réservation (MODE-001).
      requireSchedulableMode(input.modeId);
      return proposalsService.createProposal(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      );
    }),

  join: protectedProcedure
    .input(proposalIdSchema)
    .mutation(({ ctx, input }) =>
      proposalsService.joinProposal(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input.proposalId,
      ),
    ),

  leave: protectedProcedure
    .input(proposalIdSchema)
    .mutation(({ ctx, input }) =>
      proposalsService.leaveProposal(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input.proposalId,
      ),
    ),

  /**
   * Paiement d'une participation.
   * Le montant n'est pas un paramètre : il est lu sur la proposition côté
   * serveur (correction de l'écart §24).
   */
  pay: protectedProcedure
    .input(payProposalSchema)
    .mutation(({ ctx, input }) =>
      payProposal(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      ),
    ),

  upcoming: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(3) }))
    .query(({ ctx, input }) =>
      proposalsService.listUpcomingForPlayer(ctx.identity.playerId, input.limit),
    ),
});
