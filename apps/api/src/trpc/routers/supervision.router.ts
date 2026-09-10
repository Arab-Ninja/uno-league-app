import { z } from "zod";
import {
  addMatchSchema,
  addSessionVideoSchema,
  assignTeamSchema,
  nextPairing,
  recordSessionSchema,
  removeMatchSchema,
  removeSessionVideoSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import {
  addMatch,
  assignPlayerToTeam,
  generateTeams,
  listMatches,
  proposalOfMatch,
  readTeams,
  recordSession,
  removeMatch,
  sessionScoreboard,
} from "../../services/matches.service.js";
import { pendingSessions } from "../../services/proposals.service.js";
import {
  addSessionVideo,
  assertMayWatch,
  assertMaySupervise,
  listSessionVideos,
  removeSessionVideo,
} from "../../services/supervision.service.js";
import { protectedProcedure, router, supervisorProcedure } from "../init.js";

/**
 * Saisie des feuilles de match (SUP-001, SUP-002).
 *
 * Ces routes étaient réservées à l'administration ; elles s'ouvrent aux
 * **superviseurs**, des joueurs ou des arbitres désignés un par un. Elles
 * vivent ici plutôt que dans le routeur d'administration pour qu'il n'existe
 * qu'une seule implémentation : l'administration appelle exactement les mêmes
 * procédures, avec les mêmes garanties.
 *
 * Chaque route vérifie deux choses, dans cet ordre :
 *  1. `supervisorProcedure` — le droit de superviser, relu en base ;
 *  2. `assertMaySupervise` — que ce superviseur-ci n'a pas joué cette
 *     session-là. L'administration en est dispensée : c'est elle qui tranche
 *     les litiges, et une ligue dont l'organisateur joue serait bloquée.
 */

const proposalInput = z.object({ proposalId: z.number().int().positive() });

export const supervisionRouter = router({
  /** File de travail : sessions jouées dont les résultats restent à saisir. */
  pending: supervisorProcedure.query(({ ctx }) =>
    pendingSessions(
      30,
      // L'administration voit tout ; un superviseur ne voit pas ses propres
      // sessions, pour que la règle se lise dans la file plutôt que dans un
      // refus.
      ctx.identity.role === "admin" ? undefined : ctx.identity.playerId,
    ),
  ),

  /**
   * Feuille de saisie : équipes, matchs, statistiques et affiche suggérée.
   *
   * La suggestion applique la règle du terrain — le vainqueur reste, l'équipe
   * entrante reste en cas de nul — pour qu'il n'y ait qu'à confirmer dans le
   * cas courant.
   */
  sheet: supervisorProcedure
    .input(proposalInput)
    .query(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);

      const [squads, played, videos] = await Promise.all([
        readTeams(db, input.proposalId),
        listMatches(db, input.proposalId),
        listSessionVideos(db, input.proposalId),
      ]);

      const last = played.at(-1);
      return {
        teams: squads,
        matches: played,
        videos,
        scoreboard: await sessionScoreboard(db, input.proposalId),
        suggestedPairing: nextPairing(
          squads.map((team) => team.id),
          last && last.teamA && last.teamB
            ? {
                teamAId: last.teamA.id,
                teamBId: last.teamB.id,
                scoreA: last.scoreA,
                scoreB: last.scoreB,
              }
            : null,
        ),
      };
    }),

  generateTeams: supervisorProcedure
    .input(proposalInput)
    .mutation(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);
      return generateTeams({ userId: ctx.identity.userId }, input.proposalId);
    }),

  /** Ajoute un match à une session UNO League (MATCH-001). */
  addMatch: supervisorProcedure
    .input(addMatchSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);
      return addMatch({ userId: ctx.identity.userId }, input);
    }),

  removeMatch: supervisorProcedure
    .input(removeMatchSchema)
    .mutation(async ({ ctx, input }) => {
      // Le client n'envoie que l'identifiant du match : sa session est relue
      // ici, sans quoi le contrôle du conflit d'intérêt n'aurait rien à
      // vérifier.
      const proposalId = await proposalOfMatch(db, input.matchId);
      await assertMaySupervise(db, ctx.identity, proposalId);
      return removeMatch({ userId: ctx.identity.userId }, input.matchId);
    }),

  /** Déplace un joueur vers une autre équipe de la session. */
  assignTeam: supervisorProcedure
    .input(assignTeamSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);
      return assignPlayerToTeam({ userId: ctx.identity.userId }, input);
    }),

  /**
   * Saisie complète d'une session (MATCH-003).
   * Tous les matchs d'un coup, puis clôture : distinctions, récompenses et
   * mouvements de division en découlent automatiquement.
   */
  record: supervisorProcedure
    .input(recordSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);
      return recordSession({ userId: ctx.identity.userId }, input);
    }),

  // --- Vidéos (SUP-002) ----------------------------------------------------

  /**
   * Vidéos d'une session, pour ceux qui y ont droit.
   *
   * Route ouverte à tout compte connecté, mais `assertMayWatch` la referme sur
   * les participants, l'arbitre et les superviseurs : être filmé au futsal
   * n'est pas consentir à une diffusion à toute la ligue.
   */
  videos: protectedProcedure
    .input(proposalInput)
    .query(async ({ ctx, input }) => {
      await assertMayWatch(db, ctx.identity, input.proposalId);
      return listSessionVideos(db, input.proposalId);
    }),

  addVideo: supervisorProcedure
    .input(addSessionVideoSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);
      return addSessionVideo(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      );
    }),

  removeVideo: supervisorProcedure
    .input(removeSessionVideoSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMaySupervise(db, ctx.identity, input.proposalId);
      return removeSessionVideo({ userId: ctx.identity.userId }, input);
    }),
});
