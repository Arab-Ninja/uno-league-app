import { z } from "zod";
import {
  createSquadSchema,
  squadChallengeCreateSchema,
  squadContributeSchema,
  squadCounterOfferSchema,
  squadPostMessageSchema,
  squadListPlayerSchema,
  squadSeatCoverSchema,
  squadSeatPaySchema,
  squadSeatSchema,
  squadSettleSchema,
  squadTransferCounterSchema,
  squadTransferOpenSchema,
  squadTransferRespondSchema,
  squadThreadSchema,
  squadDecideRequestSchema,
  squadJoinRequestSchema,
  squadRemoveMemberSchema,
  squadSetRoleSchema,
  squadTransferOwnershipSchema,
  updateSquadSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import * as squadsService from "../../services/squads.service.js";
import * as treasuryService from "../../services/squad-treasury.service.js";
import * as challengeService from "../../services/squad-challenges.service.js";
import * as messageService from "../../services/squad-messages.service.js";
import * as seatService from "../../services/squad-seats.service.js";
import * as squadMatchService from "../../services/squad-matches.service.js";
import * as transferService from "../../services/squad-transfers.service.js";
import { router, squadAdminProcedure, squadProcedure } from "../init.js";

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

  // --- Trésorerie (SQUAD-003) ----------------------------------------------

  /**
   * Verse des UNO de son portefeuille vers la caisse du club (AC03).
   *
   * À sens unique, et c'est le point : sans cela, la trésorerie ne serait
   * qu'un portefeuille commun où chacun puiserait, et aucune mise de défi ne
   * pourrait être garantie.
   */
  contribute: squadProcedure
    .input(squadContributeSchema)
    .mutation(({ ctx, input }) =>
      treasuryService.contribute(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** Registre de la caisse, réservé aux membres. */
  treasury: squadProcedure
    .input(
      z.object({
        squadId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(({ ctx, input }) =>
      treasuryService.listTreasuryEntries(db, {
        squadId: input.squadId,
        playerId: ctx.identity.playerId,
        limit: input.limit,
      }),
    ),

  // --- Défis (SQUAD-004) ---------------------------------------------------

  challenges: squadProcedure
    .input(
      z.object({
        squadId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Les défis d'un club ne regardent que ses membres : ils exposent les
      // mises envisagées, donc les moyens de la trésorerie.
      await squadsService.assertSquadRole(
        db,
        ctx.identity.playerId,
        input.squadId,
        "member",
      );
      return challengeService.listChallenges(db, input);
    }),

  challenge: squadProcedure
    .input(z.object({ challengeId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const membership = await squadsService.activeMembership(
        db,
        ctx.identity.playerId,
      );
      return challengeService.getChallenge(
        db,
        input.challengeId,
        membership?.squadId ?? null,
        ctx.identity.playerId,
      );
    }),

  createChallenge: squadProcedure
    .input(squadChallengeCreateSchema)
    .mutation(({ ctx, input }) =>
      challengeService.createChallenge(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  counterOffer: squadProcedure
    .input(squadCounterOfferSchema)
    .mutation(({ ctx, input }) =>
      challengeService.counterOffer(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  acceptChallenge: squadProcedure
    .input(z.object({ challengeId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      challengeService.acceptChallenge(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input.challengeId,
      ),
    ),

  rejectChallenge: squadProcedure
    .input(z.object({ challengeId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      challengeService.rejectChallenge(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input.challengeId,
      ),
    ),

  cancelChallenge: squadProcedure
    .input(z.object({ challengeId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      challengeService.cancelChallenge(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input.challengeId,
      ),
    ),

  // --- Places et règlement (SQUAD-006) -------------------------------------

  /**
   * Les deux compositions d'un défi.
   *
   * Ouvertes aux deux camps : savoir qui l'on affronte fait partie du défi.
   * La caisse, elle, n'y figure pas.
   */
  roster: squadProcedure
    .input(z.object({ challengeId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      seatService.rostersOf(db, input.challengeId, ctx.identity.playerId),
    ),

  addSeat: squadProcedure
    .input(squadSeatSchema)
    .mutation(({ ctx, input }) =>
      seatService.addSeat(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  removeSeat: squadProcedure
    .input(squadSeatSchema)
    .mutation(({ ctx, input }) =>
      seatService.removeSeat(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** Le joueur règle sa propre place, depuis son portefeuille. */
  paySeat: squadProcedure
    .input(squadSeatPaySchema)
    .mutation(({ ctx, input }) =>
      seatService.paySeat(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** La caisse prend des places à sa charge — fondateur seul. */
  coverSeats: squadProcedure
    .input(squadSeatCoverSchema)
    .mutation(({ ctx, input }) =>
      seatService.coverSeats(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /**
   * Crée le match du défi, et fige les deux effectifs (SQUAD-005).
   *
   * Réservé à l'administration : c'est elle qui ouvre la feuille, comme pour
   * toute session. Le match apparaît ensuite dans les écrans habituels, et son
   * résultat se saisit par le même chemin qu'un amical ou une UNO League.
   */
  createMatch: squadAdminProcedure
    .input(z.object({ challengeId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      squadMatchService.createSquadMatch({ userId: ctx.identity.userId }, input),
    ),

  /**
   * Règle un défi : la mise revient au vainqueur, ou à chacun sur un nul.
   *
   * `squadAdminProcedure` : en phase 5, c'est le résultat du match qui
   * appellera ce règlement. Tant qu'aucun match ne le déclenche, déplacer les
   * mises reste un geste d'administration.
   */
  settleChallenge: squadAdminProcedure
    .input(squadSettleSchema)
    .mutation(({ ctx, input }) =>
      challengeService.settleChallenge({ userId: ctx.identity.userId }, input),
    ),

  /** Annule un défi accepté : mises rendues, places remboursées. */
  annulChallenge: squadAdminProcedure
    .input(
      z.object({
        challengeId: z.number().int().positive(),
        reason: z.string().trim().max(200).nullish(),
      }),
    )
    .mutation(({ ctx, input }) =>
      challengeService.annulChallenge({ userId: ctx.identity.userId }, input),
    ),

  // --- Marché des transferts (SQUAD-008) -----------------------------------

  /** Les joueurs cessibles, hors ceux de son propre club. */
  market: squadProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(30) }))
    .query(({ ctx, input }) =>
      transferService.listMarket(db, {
        viewerPlayerId: ctx.identity.playerId,
        limit: input.limit,
      }),
    ),

  /** Place un de ses membres sur la liste, ou l'en retire — fondateur seul. */
  listPlayer: squadProcedure
    .input(squadListPlayerSchema)
    .mutation(({ ctx, input }) =>
      transferService.setListed(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** Les dossiers d'un club, reçus comme envoyés. */
  transfers: squadProcedure
    .input(
      z.object({
        squadId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Les dossiers exposent des montants, donc les moyens du club : ils ne
      // regardent que ses membres.
      await squadsService.assertSquadRole(
        db,
        ctx.identity.playerId,
        input.squadId,
        "member",
      );
      return transferService.listTransfers(db, {
        squadId: input.squadId,
        viewerPlayerId: ctx.identity.playerId,
        limit: input.limit,
      });
    }),

  /** Les offres qui attendent la décision du joueur connecté. */
  myOffers: squadProcedure.query(({ ctx }) =>
    transferService.myTransferOffers(db, ctx.identity.playerId),
  ),

  transfer: squadProcedure
    .input(z.object({ transferId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      transferService.getTransfer(db, input.transferId, ctx.identity.playerId),
    ),

  openTransfer: squadProcedure
    .input(squadTransferOpenSchema)
    .mutation(({ ctx, input }) =>
      transferService.openTransfer(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  counterTransfer: squadProcedure
    .input(squadTransferCounterSchema)
    .mutation(({ ctx, input }) =>
      transferService.counterTransfer(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** Le club vendeur tranche : accepter met les montants en séquestre. */
  respondSelling: squadProcedure
    .input(squadTransferRespondSchema)
    .mutation(({ ctx, input }) =>
      transferService.respondSelling(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  /** Le joueur tranche, et c'est lui qui conclut. */
  respondTransfer: squadProcedure
    .input(squadTransferRespondSchema)
    .mutation(({ ctx, input }) =>
      transferService.respondPlayer(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  cancelTransfer: squadProcedure
    .input(z.object({ transferId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      transferService.cancelTransfer(
        { userId: ctx.identity.userId, playerId: ctx.identity.playerId },
        input,
      ),
    ),

  // --- Fils de discussion (SQUAD-005) --------------------------------------

  /**
   * Messages d'un fil.
   *
   * `afterId` ne rapporte que la suite : l'écran interroge périodiquement, et
   * rapatrier tout le fil à chaque tour coûterait cher pour rien.
   */
  messages: squadProcedure
    .input(
      z.object({
        thread: squadThreadSchema,
        limit: z.number().int().min(1).max(100).default(50),
        afterId: z.number().int().positive().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      messageService.listMessages(db, {
        playerId: ctx.identity.playerId,
        thread: input.thread,
        limit: input.limit,
        ...(input.afterId === undefined ? {} : { afterId: input.afterId }),
      }),
    ),

  postMessage: squadProcedure
    .input(squadPostMessageSchema)
    .mutation(({ ctx, input }) =>
      messageService.postMessage(
        { playerId: ctx.identity.playerId },
        { thread: input.thread, body: input.body },
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
