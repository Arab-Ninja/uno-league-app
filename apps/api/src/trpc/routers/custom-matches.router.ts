import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  AppError,
  addMatchSchema,
  addSessionVideoSchema,
  assignTeamSchema,
  nextPairing,
  recordSessionSchema,
  removeMatchSchema,
  removeSessionVideoSchema,
  type PublicPlayer,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { players, proposalParticipants, proposals } from "../../db/schema.js";
import {
  addCustomTeam,
  addMatch,
  assignPlayerToTeam,
  listMatches,
  proposalOfMatch,
  readTeams,
  recordSession,
  removeMatch,
  reopenSession,
  sessionScoreboard,
  unassignPlayer,
} from "../../services/matches.service.js";
import {
  publicPlayerColumns,
  toPublicPlayer,
} from "../../services/players.service.js";
import {
  addSessionVideo,
  listSessionVideos,
  removeSessionVideo,
} from "../../services/supervision.service.js";
import { protectedProcedure, router } from "../init.js";

/**
 * La feuille de match d'un match personnalisé, tenue par son organisateur
 * (PRIV-003).
 *
 * **Les mêmes gestes que la saisie de l'administration** — équipes, matchs,
 * scores, statistiques, vidéo — et les mêmes services derrière : il n'y a
 * qu'une façon d'écrire une feuille de match. Ce qui change, c'est qui tient
 * le stylo, et c'est tout l'objet de ce routeur : chaque route vérifie que la
 * séance est un match personnalisé et que celui qui écrit l'a organisé.
 *
 * **Rien de ce qui s'écrit ici ne sort de la séance.** Le mode ne porte aucun
 * effet — ni XP, ni statistiques de carrière, ni UNO, ni classement — si
 * bien que la clôture enregistre un classement de séance lisible, et
 * n'avance aucun compteur. C'est ce qui permet de confier le stylo à un
 * joueur : il ne peut rien s'attribuer.
 */

const proposalInput = z.object({ proposalId: z.number().int().positive() });

async function organizedSession(playerId: number, proposalId: number) {
  const [row] = await db
    .select({
      id: proposals.id,
      modeId: proposals.modeId,
      creatorPlayerId: proposals.creatorPlayerId,
      status: proposals.status,
      startsAtUtc: proposals.startsAtUtc,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Cette session est introuvable.");
  if (row.modeId !== "custom") {
    throw new AppError(
      "RULE_VIOLATION",
      "Seul un match personnalisé se saisit par son organisateur.",
    );
  }
  if (row.creatorPlayerId !== playerId) {
    throw new AppError(
      "FORBIDDEN",
      "Seul l'organisateur de la séance peut faire ce choix.",
    );
  }
  return row;
}

/**
 * La feuille ne s'ouvre qu'une fois la séance commencée et confirmée : avant,
 * il n'y a rien à raconter, et une feuille remplie d'avance ne dirait rien de
 * ce qui s'est joué.
 */
async function playedSession(playerId: number, proposalId: number) {
  const row = await organizedSession(playerId, proposalId);
  if (row.status !== "session" && row.status !== "completed") {
    throw new AppError(
      "RULE_VIOLATION",
      "La séance doit être confirmée pour en saisir les résultats.",
    );
  }
  if (row.startsAtUtc.getTime() > Date.now()) {
    throw new AppError(
      "RULE_VIOLATION",
      "La feuille de match se remplit une fois la séance commencée.",
    );
  }
  return row;
}

/** Les inscrits qui ne jouent dans aucune équipe : absents, ou pas encore placés. */
async function unassignedOf(
  proposalId: number,
  seated: Set<number>,
): Promise<PublicPlayer[]> {
  const rows = await db
    .select(publicPlayerColumns)
    .from(proposalParticipants)
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(eq(proposalParticipants.proposalId, proposalId))
    .orderBy(proposalParticipants.joinedAt);
  return rows.filter((row) => !seated.has(row.id)).map(toPublicPlayer);
}

async function assertParticipant(proposalId: number, playerId: number) {
  const [seat] = await db
    .select({ id: proposalParticipants.id })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, playerId),
      ),
    )
    .limit(1);
  if (!seat) throw new AppError("NOT_PARTICIPANT");
}

export const customMatchesRouter = router({
  /** La feuille : équipes, joueurs non placés, matchs, vidéos, classement. */
  sheet: protectedProcedure
    .input(proposalInput)
    .query(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);

      const [teams, played, videos, scoreboard] = await Promise.all([
        readTeams(db, input.proposalId),
        listMatches(db, input.proposalId),
        listSessionVideos(db, input.proposalId),
        sessionScoreboard(db, input.proposalId),
      ]);
      const seated = new Set(
        teams.flatMap((team) => team.players.map((player) => player.id)),
      );

      const last = played.at(-1);
      return {
        teams,
        matches: played,
        videos,
        scoreboard,
        unassigned: await unassignedOf(input.proposalId, seated),
        suggestedPairing: nextPairing(
          teams.map((team) => team.id),
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

  addTeam: protectedProcedure
    .input(proposalInput)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return addCustomTeam({ userId: ctx.identity.userId }, input.proposalId);
    }),

  /** Place un inscrit dans une équipe — et seulement un inscrit. */
  assignTeam: protectedProcedure
    .input(assignTeamSchema)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      await assertParticipant(input.proposalId, input.playerId);
      return assignPlayerToTeam({ userId: ctx.identity.userId }, input);
    }),

  /** Retire un inscrit des équipes : il n'est pas venu. */
  unassign: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        playerId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return unassignPlayer({ userId: ctx.identity.userId }, input);
    }),

  addMatch: protectedProcedure
    .input(addMatchSchema)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return addMatch({ userId: ctx.identity.userId }, input);
    }),

  removeMatch: protectedProcedure
    .input(removeMatchSchema)
    .mutation(async ({ ctx, input }) => {
      const proposalId = await proposalOfMatch(db, input.matchId);
      await playedSession(ctx.identity.playerId, proposalId);
      return removeMatch({ userId: ctx.identity.userId }, input.matchId);
    }),

  /** Scores et statistiques de tous les matchs, puis clôture de la feuille. */
  record: protectedProcedure
    .input(recordSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return recordSession({ userId: ctx.identity.userId }, input);
    }),

  /** Rouvre la feuille pour la corriger : il n'y a rien à défaire ailleurs. */
  reopen: protectedProcedure
    .input(proposalInput)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return reopenSession({ userId: ctx.identity.userId }, input.proposalId);
    }),

  addVideo: protectedProcedure
    .input(addSessionVideoSchema)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return addSessionVideo(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      );
    }),

  removeVideo: protectedProcedure
    .input(removeSessionVideoSchema)
    .mutation(async ({ ctx, input }) => {
      await playedSession(ctx.identity.playerId, input.proposalId);
      return removeSessionVideo({ userId: ctx.identity.userId }, input);
    }),
});
