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
  reopenSession,
  sessionScoreboard,
} from "../../services/matches.service.js";
import { pendingSessions } from "../../services/proposals.service.js";
import {
  addSessionVideo,
  assertMayWatch,
  listSessionVideos,
  removeSessionVideo,
} from "../../services/supervision.service.js";
import { adminProcedure, protectedProcedure, router } from "../init.js";

/**
 * Saisie des feuilles de match (SUP-001, SUP-002).
 *
 * **Ces routes touchent une session existante : elles sont réservées à
 * l'administration** (SUP-003).
 *
 * Elles s'étaient ouvertes aux superviseurs ; le client a resserré la règle,
 * et elle se défend : saisir une feuille depuis un enregistrement vidéo et
 * retoucher une session déjà en base ne demandent pas la même confiance. La
 * première produit une proposition de résultat, que la publication soumet à
 * ses propres contrôles ; la seconde réécrit directement le classement, les
 * récompenses et les divisions.
 *
 * Un superviseur garde donc **la saisie en visionnage**, et rien d'autre :
 * `tracker.router.ts` reste en `supervisorProcedure`.
 *
 * Le contrôle du conflit d'intérêt a suivi le droit. Il n'a plus de sens ici :
 * l'administration en a toujours été dispensée — c'est elle qui tranche les
 * litiges, et une ligue dont l'organisateur joue serait bloquée — si bien
 * qu'un contrôle sur ces routes ne se déclencherait plus jamais. Le laisser
 * en place aurait fait croire à une garantie qui n'existe pas.
 *
 * Il vit désormais là où il mord : à la **publication d'une feuille de
 * visionnage** (`tracker.service.ts`), qui est le seul geste par lequel un
 * superviseur décide encore de distinctions, d'UNO et de divisions.
 */

const proposalInput = z.object({ proposalId: z.number().int().positive() });

export const supervisionRouter = router({
  /** File de travail : sessions jouées dont les résultats restent à saisir. */
  pending: adminProcedure.query(() => pendingSessions(30)),

  /**
   * Feuille de saisie : équipes, matchs, statistiques et affiche suggérée.
   *
   * La suggestion applique la règle du terrain — le vainqueur reste, l'équipe
   * entrante reste en cas de nul — pour qu'il n'y ait qu'à confirmer dans le
   * cas courant.
   */
  sheet: adminProcedure
    .input(proposalInput)
    .query(async ({ ctx, input }) => {

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

  generateTeams: adminProcedure
    .input(proposalInput)
    .mutation(async ({ ctx, input }) => {
      return generateTeams({ userId: ctx.identity.userId }, input.proposalId);
    }),

  /** Ajoute un match à une session UNO League (MATCH-001). */
  addMatch: adminProcedure
    .input(addMatchSchema)
    .mutation(async ({ ctx, input }) => {
      return addMatch({ userId: ctx.identity.userId }, input);
    }),

  removeMatch: adminProcedure
    .input(removeMatchSchema)
    .mutation(async ({ ctx, input }) => {
      // Le client n'envoie que l'identifiant du match : sa session est relue
      // ici, sans quoi le contrôle du conflit d'intérêt n'aurait rien à
      // vérifier.
      const proposalId = await proposalOfMatch(db, input.matchId);
      return removeMatch({ userId: ctx.identity.userId }, input.matchId);
    }),

  /** Déplace un joueur vers une autre équipe de la session. */
  assignTeam: adminProcedure
    .input(assignTeamSchema)
    .mutation(async ({ ctx, input }) => {
      return assignPlayerToTeam({ userId: ctx.identity.userId }, input);
    }),

  /**
   * Saisie complète d'une session (MATCH-003).
   * Tous les matchs d'un coup, puis clôture : distinctions, récompenses et
   * mouvements de division en découlent automatiquement.
   */
  record: adminProcedure
    .input(recordSessionSchema)
    .mutation(async ({ ctx, input }) => {
      return recordSession({ userId: ctx.identity.userId }, input);
    }),

  /**
   * Rouvre une session clôturée pour corriger sa saisie (MATCH-007).
   *
   * Le même droit que la saisie, et le même garde-fou : un superviseur qui a
   * joué ou arbitré cette session ne la rouvre pas davantage qu'il ne la
   * saisit. Rouvrir défait des distinctions et des montées de division —
   * c'est la dernière personne à qui le confier.
   *
   * La session repasse en « confirmée » : elle se ressaisit ensuite par
   * `record`, exactement comme une première fois.
   */
  reopen: adminProcedure
    .input(proposalInput)
    .mutation(async ({ ctx, input }) => {
      return reopenSession({ userId: ctx.identity.userId }, input.proposalId);
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

  addVideo: adminProcedure
    .input(addSessionVideoSchema)
    .mutation(async ({ ctx, input }) => {
      return addSessionVideo(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      );
    }),

  removeVideo: adminProcedure
    .input(removeSessionVideoSchema)
    .mutation(async ({ ctx, input }) => {
      return removeSessionVideo({ userId: ctx.identity.userId }, input);
    }),
});
