import { z } from "zod";
import {
  GAME_MODES,
  claimSeatSchema,
  createProposalSchema,
  generateSlots,
  listProposalsSchema,
  payProposalSchema,
  proposalIdSchema,
  requireSchedulableMode,
  substituteSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import { availablePaymentMethods } from "../../payments/index.js";
import { claimSeat, payProposal } from "../../services/payments.service.js";
import { listActiveVenues } from "../../services/venues.service.js";
import * as proposalsService from "../../services/proposals.service.js";
import {
  listMatches,
  sessionPodium,
  sessionScoreboard,
} from "../../services/matches.service.js";
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
  config: publicProcedure.query(async () => ({
    modes: GAME_MODES.map((mode) => ({
      ...mode,
      slots: mode.schedulable ? generateSlots(mode) : [],
    })),
    // Les salles viennent de la base : elles sont administrables, et une
    // salle retirée ne doit plus apparaître au moment de proposer un créneau.
    venues: (await listActiveVenues()).map((venue) => ({
      id: venue.slug,
      name: venue.name,
      timezone: venue.timezone,
    })),
    paymentMethods: availablePaymentMethods(),
  })),

  /**
   * Présentation des salles, pour l'écran Informations (INFO-001).
   * Les salles retirées n'y figurent pas : elles n'accueillent plus personne.
   */
  venues: protectedProcedure.query(() => listActiveVenues()),

  /** Se déclarer remplaçant sur une réservation (CAL-008). */
  becomeSubstitute: protectedProcedure
    .input(substituteSchema)
    .mutation(({ ctx, input }) =>
      proposalsService.registerSubstitute(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input.proposalId,
      ),
    ),

  withdrawSubstitute: protectedProcedure
    .input(substituteSchema)
    .mutation(({ ctx, input }) =>
      proposalsService.withdrawSubstitute(
        { playerId: ctx.identity.playerId },
        input.proposalId,
      ),
    ),

  /**
   * Reprise d'une place non réglée par un remplaçant (CAL-008).
   * La place est saisie puis payée dans la même transaction.
   */
  claimSeat: protectedProcedure
    .input(claimSeatSchema)
    .mutation(({ ctx, input }) =>
      claimSeat(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        {
          proposalId: input.proposalId,
          ...(input.replacePlayerId === undefined
            ? {}
            : { replacePlayerId: input.replacePlayerId }),
          idempotencyKey: input.idempotencyKey,
        },
      ),
    ),

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

  /**
   * Podium d'une session terminée : meilleur buteur, passeur, défenseur et
   * homme du match, avec la carte de chaque joueur distingué (§8.2).
   */
  podium: protectedProcedure
    .input(proposalIdSchema)
    .query(({ input }) => sessionPodium(db, input.proposalId)),

  /**
   * Feuille de match : statistiques de chaque joueur sur la session, classées
   * selon le barème officiel du classement général.
   */
  scoreboard: protectedProcedure
    .input(proposalIdSchema)
    .query(({ input }) => sessionScoreboard(db, input.proposalId)),

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
