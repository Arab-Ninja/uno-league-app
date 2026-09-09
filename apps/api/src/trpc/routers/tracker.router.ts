import * as z from "zod";
import { asc, eq } from "drizzle-orm";
import {
  trackerAddMatchSchema,
  trackerAddParticipantSchema,
  trackerCopyRosterSchema,
  trackerCreateSessionSchema,
  trackerDraftSchema,
  trackerLinkParticipantSchema,
  trackerMatchIdSchema,
  trackerMoveParticipantSchema,
  trackerParticipantIdSchema,
  trackerPublishSchema,
  trackerSessionIdSchema,
  trackerSyncSchema,
  trackerUpdateMatchSchema,
  trackerUpdateSessionSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import * as tracker from "../../services/tracker.service.js";
import { publicPlayerColumns, toPublicPlayer } from "../../services/players.service.js";
import { pendingSessions } from "../../services/proposals.service.js";
import { adminProcedure, router } from "../init.js";

/**
 * Saisie des statistiques en visionnage (TRACK-001).
 *
 * Réservé à l'administration : une feuille de saisie décide de statistiques
 * de carrière, de distinctions et de mouvements de division. Le rôle est relu
 * en base à chaque requête, comme partout ailleurs.
 *
 * Chaque mutation renvoie la feuille complète plutôt qu'un fragment. C'est un
 * choix délibéré : l'écran de saisie n'a jamais à recoller des morceaux, donc
 * il ne peut pas afficher un total qui contredirait le serveur — et une seule
 * requête suffit là où il en aurait fallu trois.
 */
export const trackerRouter = router({
  list: adminProcedure.query(() => tracker.listSessions(db)),

  get: adminProcedure
    .input(trackerSessionIdSchema)
    .query(({ input }) => tracker.getSheet(input.sessionId)),

  /**
   * Sessions confirmées auxquelles une feuille peut se rattacher.
   * Rattacher évite de ressaisir le lieu, la date, la division et les joueurs.
   */
  attachable: adminProcedure.query(() => pendingSessions()),

  /**
   * Annuaire complet des joueurs, en un seul appel.
   *
   * Le filtrage se fait ensuite côté écran, sans aller-retour : composer une
   * équipe consiste à taper trois lettres et à toucher un nom, quinze fois de
   * suite. Une requête par frappe rendrait ce geste saccadé, et une ligue
   * amateur tient largement dans une seule réponse.
   */
  players: adminProcedure.query(async () => {
    const rows = await db
      .select(publicPlayerColumns)
      .from(players)
      .orderBy(asc(players.displayName))
      .limit(500);

    return rows.map(toPublicPlayer);
  }),

  create: adminProcedure
    .input(trackerCreateSessionSchema)
    .mutation(({ ctx, input }) =>
      tracker.createSession({ userId: ctx.identity.userId }, input),
    ),

  update: adminProcedure
    .input(trackerUpdateSessionSchema)
    .mutation(({ ctx, input }) =>
      tracker.updateSession({ userId: ctx.identity.userId }, input),
    ),

  remove: adminProcedure
    .input(trackerSessionIdSchema)
    .mutation(({ ctx, input }) =>
      tracker.removeSession({ userId: ctx.identity.userId }, input.sessionId),
    ),

  // --- Composition ---------------------------------------------------------

  addParticipant: adminProcedure
    .input(trackerAddParticipantSchema)
    .mutation(({ ctx, input }) =>
      tracker.addParticipant({ userId: ctx.identity.userId }, input),
    ),

  moveParticipant: adminProcedure
    .input(trackerMoveParticipantSchema)
    .mutation(({ ctx, input }) =>
      tracker.moveParticipant({ userId: ctx.identity.userId }, input),
    ),

  removeParticipant: adminProcedure
    .input(trackerParticipantIdSchema)
    .mutation(({ ctx, input }) =>
      tracker.removeParticipant({ userId: ctx.identity.userId }, input.participantId),
    ),

  linkParticipant: adminProcedure
    .input(trackerLinkParticipantSchema)
    .mutation(({ ctx, input }) =>
      tracker.linkParticipant({ userId: ctx.identity.userId }, input),
    ),

  draft: adminProcedure
    .input(trackerDraftSchema)
    .mutation(({ ctx, input }) =>
      tracker.draftRoster({ userId: ctx.identity.userId }, input),
    ),

  copyRoster: adminProcedure
    .input(trackerCopyRosterSchema)
    .mutation(({ ctx, input }) =>
      tracker.copyRoster({ userId: ctx.identity.userId }, input),
    ),

  // --- Matchs --------------------------------------------------------------

  addMatch: adminProcedure
    .input(trackerAddMatchSchema)
    .mutation(({ ctx, input }) =>
      tracker.addMatch({ userId: ctx.identity.userId }, input),
    ),

  updateMatch: adminProcedure
    .input(trackerUpdateMatchSchema)
    .mutation(({ ctx, input }) =>
      tracker.updateMatch({ userId: ctx.identity.userId }, input),
    ),

  removeMatch: adminProcedure
    .input(trackerMatchIdSchema)
    .mutation(({ ctx, input }) =>
      tracker.removeMatch({ userId: ctx.identity.userId }, input.matchId),
    ),

  // --- Actions saisies -----------------------------------------------------

  sync: adminProcedure
    .input(trackerSyncSchema)
    .mutation(({ ctx, input }) =>
      tracker.syncEvents({ userId: ctx.identity.userId }, input),
    ),

  // --- Publication ---------------------------------------------------------

  publish: adminProcedure
    .input(trackerPublishSchema)
    .mutation(({ ctx, input }) =>
      tracker.publishSession(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** Feuilles de saisie déjà publiées, pour choisir une composition à reprendre. */
  recentRosters: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ input }) => {
      const sessions = await tracker.listSessions(db, input.limit);
      return sessions.filter((session) => session.participantCount > 0);
    }),
});
