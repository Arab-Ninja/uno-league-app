import * as z from "zod";
import { asc, eq } from "drizzle-orm";
import {
  AppError,
  trackerAddMatchSchema,
  trackerAddParticipantSchema,
  trackerAddVideoSchema,
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
  trackerRemoveVideoSchema,
  trackerUpdateSessionSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import * as tracker from "../../services/tracker.service.js";
import {
  publicPlayerColumns,
  toPublicPlayer,
} from "../../services/players.service.js";
import {
  attachableSessions,
  isSessionOfPlayer,
} from "../../services/proposals.service.js";
import { router, supervisorProcedure } from "../init.js";

/**
 * Saisie des statistiques en visionnage (TRACK-001).
 *
 * Réservé à l'administration et aux **superviseurs** (SUP-001) : une feuille
 * de saisie décide de statistiques de carrière, de distinctions et de
 * mouvements de division. Le droit est relu en base à chaque requête, comme
 * partout ailleurs.
 *
 * Une feuille de visionnage n'est pas rattachée à une réservation : elle naît
 * d'un besoin de relevé, pas d'un besoin commercial. Le contrôle du conflit
 * d'intérêt s'applique donc au moment où elle est **publiée** vers une session
 * réelle — c'est là seulement qu'un superviseur pourrait toucher à son propre
 * classement.
 *
 * Chaque mutation renvoie la feuille complète plutôt qu'un fragment. C'est un
 * choix délibéré : l'écran de saisie n'a jamais à recoller des morceaux, donc
 * il ne peut pas afficher un total qui contredirait le serveur — et une seule
 * requête suffit là où il en aurait fallu trois.
 */
/**
 * Un superviseur ne touche pas la feuille où il figure (SUP-001).
 *
 * Le refus se lit ici, à l'entrée de chaque route, plutôt qu'à la seule
 * publication : remplir une feuille qu'on ne pourra pas conclure est du
 * travail perdu, et l'interface n'a aucun moyen de le deviner.
 */
async function guard(
  ctx: { identity: { playerId: number; role: "user" | "admin" } },
  sessionId: number | null,
): Promise<void> {
  if (sessionId === null) return;
  await tracker.assertMayHandleSheet(db, ctx.identity, sessionId);
}

export const trackerRouter = router({
  list: supervisorProcedure.query(({ ctx }) =>
    ctx.identity.role === "admin"
      ? tracker.listSessions(db)
      : tracker.listSessions(db, 40, ctx.identity.playerId),
  ),

  get: supervisorProcedure
    .input(trackerSessionIdSchema)
    .query(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.getSheet(input.sessionId);
    }),

  /**
   * Sessions qu'une feuille peut reprendre.
   *
   * L'administration les voit toutes ; un superviseur ne se voit pas proposer
   * celles qu'il a jouées ou arbitrées — il ne pourrait pas les publier
   * (SUP-001).
   */
  attachable: supervisorProcedure.query(({ ctx }) =>
    ctx.identity.role === "admin"
      ? attachableSessions()
      : attachableSessions(40, ctx.identity.playerId),
  ),

  /**
   * Annuaire complet des joueurs, en un seul appel.
   *
   * Le filtrage se fait ensuite côté écran, sans aller-retour : composer une
   * équipe consiste à taper trois lettres et à toucher un nom, quinze fois de
   * suite. Une requête par frappe rendrait ce geste saccadé, et une ligue
   * amateur tient largement dans une seule réponse.
   */
  players: supervisorProcedure.query(async () => {
    const rows = await db
      .select(publicPlayerColumns)
      .from(players)
      .orderBy(asc(players.displayName))
      .limit(500);

    return rows.map(toPublicPlayer);
  }),

  create: supervisorProcedure
    .input(trackerCreateSessionSchema)
    .mutation(async ({ ctx, input }) => {
      // Rattacher sa propre séance reviendrait à s'ouvrir la feuille qu'on ne
      // pourra pas publier : le refus vient avant la création (SUP-001).
      if (ctx.identity.role !== "admin" && input.proposalId != null) {
        const own = await isSessionOfPlayer(
          db,
          input.proposalId,
          ctx.identity.playerId,
        );
        if (own) {
          throw new AppError(
            "RULE_VIOLATION",
            "Vous avez pris part à cette session : sa saisie revient à un autre superviseur.",
          );
        }
      }
      return tracker.createSession({ userId: ctx.identity.userId }, input);
    }),

  update: supervisorProcedure
    .input(trackerUpdateSessionSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.updateSession({ userId: ctx.identity.userId }, input);
    }),

  remove: supervisorProcedure
    .input(trackerSessionIdSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.removeSession(
        { userId: ctx.identity.userId },
        input.sessionId,
      );
    }),

  // --- Composition ---------------------------------------------------------

  addParticipant: supervisorProcedure
    .input(trackerAddParticipantSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.addParticipant({ userId: ctx.identity.userId }, input);
    }),

  moveParticipant: supervisorProcedure
    .input(trackerMoveParticipantSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(
        ctx,
        await tracker.sessionOfParticipant(db, input.participantId),
      );
      return tracker.moveParticipant({ userId: ctx.identity.userId }, input);
    }),

  removeParticipant: supervisorProcedure
    .input(trackerParticipantIdSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(
        ctx,
        await tracker.sessionOfParticipant(db, input.participantId),
      );
      return tracker.removeParticipant(
        { userId: ctx.identity.userId },
        input.participantId,
      );
    }),

  linkParticipant: supervisorProcedure
    .input(trackerLinkParticipantSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(
        ctx,
        await tracker.sessionOfParticipant(db, input.participantId),
      );
      return tracker.linkParticipant({ userId: ctx.identity.userId }, input);
    }),

  draft: supervisorProcedure
    .input(trackerDraftSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.draftRoster({ userId: ctx.identity.userId }, input);
    }),

  copyRoster: supervisorProcedure
    .input(trackerCopyRosterSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.copyRoster({ userId: ctx.identity.userId }, input);
    }),

  // --- Matchs --------------------------------------------------------------

  addMatch: supervisorProcedure
    .input(trackerAddMatchSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.addMatch({ userId: ctx.identity.userId }, input);
    }),

  updateMatch: supervisorProcedure
    .input(trackerUpdateMatchSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, await tracker.sessionOfSheetMatch(db, input.matchId));
      return tracker.updateMatch({ userId: ctx.identity.userId }, input);
    }),

  removeMatch: supervisorProcedure
    .input(trackerMatchIdSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, await tracker.sessionOfSheetMatch(db, input.matchId));
      return tracker.removeMatch(
        { userId: ctx.identity.userId },
        input.matchId,
      );
    }),

  // --- Actions saisies -----------------------------------------------------

  sync: supervisorProcedure
    .input(trackerSyncSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.syncEvents({ userId: ctx.identity.userId }, input);
    }),

  // --- Publication ---------------------------------------------------------

  publish: supervisorProcedure
    .input(trackerPublishSchema)
    .mutation(({ ctx, input }) =>
      tracker.publishSession(
        {
          userId: ctx.identity.userId,
          playerId: ctx.identity.playerId,
          role: ctx.identity.role,
        },
        input,
      ),
    ),

  /** Rattache un enregistrement à la feuille (TRACK-001). */
  addVideo: supervisorProcedure
    .input(trackerAddVideoSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.addVideo({ userId: ctx.identity.userId }, input);
    }),

  removeVideo: supervisorProcedure
    .input(trackerRemoveVideoSchema)
    .mutation(async ({ ctx, input }) => {
      await guard(ctx, input.sessionId);
      return tracker.removeVideo({ userId: ctx.identity.userId }, input);
    }),

  /** Feuilles de saisie déjà publiées, pour choisir une composition à reprendre. */
  recentRosters: supervisorProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ input }) => {
      const sessions = await tracker.listSessions(db, input.limit);
      return sessions.filter((session) => session.participantCount > 0);
    }),
});
