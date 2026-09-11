import { z } from "zod";
import {
  createSquadSchema,
  squadDecideRequestSchema,
  squadJoinRequestSchema,
  squadRemoveMemberSchema,
  squadSetRoleSchema,
  squadTransferOwnershipSchema,
  updateSquadSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import * as squadsService from "../../services/squads.service.js";
import { router, squadProcedure } from "../init.js";

/**
 * Mode SQUAD : clubs, effectifs et rôles (SQUAD-001, SQUAD-002).
 *
 * Toutes les routes passent par `squadProcedure`, qui exige une session **et**
 * un mode ouvert. Le drapeau ne masque pas seulement l'onglet : une
 * fonctionnalité simplement cachée reste appelable par qui regarde le réseau,
 * et celle-ci déplace des UNO.
 *
 * Les droits par rôle ne sont pas vérifiés ici mais dans le service, au plus
 * près de l'écriture et **dans la même transaction** : entre un contrôle fait
 * au seuil et l'écriture qui suit, un membre peut avoir été rétrogradé.
 */

const squadIdInput = z.object({ squadId: z.number().int().positive() });

export const squadsRouter = router({
  /** Le club du joueur connecté, et les demandes qu'il attend. */
  mine: squadProcedure.query(({ ctx }) =>
    squadsService.getMySquad(db, ctx.identity.playerId),
  ),

  /** Annuaire, du mieux classé au moins bien. */
  list: squadProcedure
    .input(
      z.object({
        query: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(({ ctx, input }) =>
      squadsService.listSquads(db, input, ctx.identity.playerId),
    ),

  /** Profil public d'un club. */
  get: squadProcedure
    .input(
      z.union([
        squadIdInput,
        z.object({ slug: z.string().trim().min(1).max(40) }),
      ]),
    )
    .query(({ ctx, input }) =>
      squadsService.getSquad(db, input, ctx.identity.playerId),
    ),

  /**
   * Vue détaillée : effectif, trésorerie, demandes en attente.
   *
   * Ouverte à tous, mais le service en retire ce qui ne regarde pas un
   * visiteur — une équipe adverse n'a pas à jauger les moyens de celle
   * qu'elle s'apprête à défier.
   */
  detail: squadProcedure
    .input(squadIdInput)
    .query(({ ctx, input }) =>
      squadsService.getSquadDetail(db, input.squadId, ctx.identity.playerId),
    ),

  // --- Fondation et administration du club ---------------------------------

  create: squadProcedure
    .input(createSquadSchema)
    .mutation(({ ctx, input }) =>
      squadsService.createSquad(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  update: squadProcedure
    .input(updateSquadSchema)
    .mutation(({ ctx, input }) =>
      squadsService.updateSquad(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  transferOwnership: squadProcedure
    .input(squadTransferOwnershipSchema)
    .mutation(({ ctx, input }) =>
      squadsService.transferOwnership(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  // --- Adhésion ------------------------------------------------------------

  requestToJoin: squadProcedure
    .input(squadJoinRequestSchema)
    .mutation(({ ctx, input }) =>
      squadsService.requestToJoin(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  cancelRequest: squadProcedure
    .input(z.object({ requestId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      squadsService.cancelJoinRequest(
        { playerId: ctx.identity.playerId },
        input.requestId,
      ),
    ),

  decideRequest: squadProcedure
    .input(squadDecideRequestSchema)
    .mutation(({ ctx, input }) =>
      squadsService.decideJoinRequest(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  // --- Effectif ------------------------------------------------------------

  setMemberRole: squadProcedure
    .input(squadSetRoleSchema)
    .mutation(({ ctx, input }) =>
      squadsService.setMemberRole(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  removeMember: squadProcedure
    .input(squadRemoveMemberSchema)
    .mutation(({ ctx, input }) =>
      squadsService.removeMember(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  leave: squadProcedure.mutation(({ ctx }) =>
    squadsService.leaveSquad({
      userId: ctx.identity.userId,
      playerId: ctx.identity.playerId,
    }),
  ),
});
