import {
  createTournamentSchema,
  listTournamentsSchema,
  recordTournamentMatchSchema,
  tournamentIdSchema,
} from "@uno/shared";
import * as tournamentsService from "../../services/tournaments.service.js";
import { router, squadAdminProcedure, squadProcedure } from "../init.js";

/**
 * Tournois entre SQUADs (TOUR-001).
 *
 * Toutes les routes passent par `squadProcedure` : un tournoi oppose des
 * clubs, et il n'a donc rien à dire tant que le mode SQUAD est fermé. La
 * création, le tirage et la saisie des résultats relèvent de
 * l'administration — ce sont des décisions de ligue, pas de club.
 *
 * L'engagement, lui, appartient au club : le serveur vérifie le rôle
 * (fondateur ou capitaine) dans le service, sous le verrou du tournoi, et pas
 * ici — c'est là que la caisse se déplace.
 */
export const tournamentsRouter = router({
  list: squadProcedure
    .input(listTournamentsSchema)
    .query(({ ctx, input }) =>
      tournamentsService.listTournaments(
        { playerId: ctx.identity.playerId },
        input,
      ),
    ),

  get: squadProcedure
    .input(tournamentIdSchema)
    .query(({ ctx, input }) =>
      tournamentsService.getTournament(
        { playerId: ctx.identity.playerId },
        input.tournamentId,
      ),
    ),

  /** Engage son club, droit d'inscription prélevé sur la caisse (TOUR-002). */
  register: squadProcedure
    .input(tournamentIdSchema)
    .mutation(async ({ ctx, input }) => {
      const squadId = await tournamentsService.squadOfPlayer(
        ctx.identity.playerId,
      );
      return tournamentsService.registerSquad(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        { tournamentId: input.tournamentId, squadId },
      );
    }),

  withdraw: squadProcedure
    .input(tournamentIdSchema)
    .mutation(async ({ ctx, input }) => {
      const squadId = await tournamentsService.squadOfPlayer(
        ctx.identity.playerId,
      );
      await tournamentsService.withdrawSquad(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        { tournamentId: input.tournamentId, squadId },
      );
      return tournamentsService.getTournament(
        { playerId: ctx.identity.playerId },
        input.tournamentId,
      );
    }),

  // --- Administration -------------------------------------------------------

  create: squadAdminProcedure
    .input(createTournamentSchema)
    .mutation(({ ctx, input }) =>
      tournamentsService.createTournament(
        { userId: ctx.identity.userId },
        input,
      ),
    ),

  cancel: squadAdminProcedure
    .input(tournamentIdSchema)
    .mutation(({ ctx, input }) =>
      tournamentsService.cancelTournament(
        { userId: ctx.identity.userId },
        input.tournamentId,
      ),
    ),

  draw: squadAdminProcedure
    .input(tournamentIdSchema)
    .mutation(({ ctx, input }) =>
      tournamentsService.drawTournament(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input.tournamentId,
      ),
    ),

  record: squadAdminProcedure
    .input(recordTournamentMatchSchema)
    .mutation(({ ctx, input }) =>
      tournamentsService.recordMatch(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),
});
