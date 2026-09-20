import { z } from "zod";
import {
  adminAdjustUnoSchema,
  adminEventsSchema,
  adminListPlayersSchema,
  adminSetAccountTypeSchema,
  adminUpdatePlayerSchema,
  charityInputSchema,
  createProposalSchema,
  decideShopSuggestionSchema,
  setSupervisorSchema,
  adminSetDivisionSchema,
  announcementInputSchema,
  markAdminEventsReadSchema,
  paginationSchema,
  rescheduleProposalSchema,
  reportMatchSchema,
  requireSchedulableMode,
  shopItemInputSchema,
  shopSuggestionStatusSchema,
  venueInputSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import * as adminService from "../../services/admin.service.js";
import * as accountDeletionService from "../../services/account-deletion.service.js";
import * as proposalsService from "../../services/proposals.service.js";
import * as purgeService from "../../services/purge.service.js";
import * as rosterService from "../../services/session-roster.service.js";
import * as playersService from "../../services/players.service.js";
import { createAnnouncement } from "../../services/announcements.service.js";
import { countInconsistentBalances } from "../../services/ledger.service.js";
import {
  listAllOrders,
  updateOrderStatus,
} from "../../services/orders.service.js";
import {
  completeSession,
  reportMatch,
  validateMatch,
} from "../../services/matches.service.js";
import {
  adminEventCounts,
  listAdminEvents,
  markAdminEventsRead,
} from "../../services/admin-events.service.js";
import {
  createCharity,
  listAllCharities,
  updateCharity,
} from "../../services/charities.service.js";
import {
  countPendingSuggestions,
  decideSuggestion,
  listSuggestions,
} from "../../services/shop-suggestions.service.js";
import {
  createVenue,
  listAllVenues,
  removeVenue,
  updateVenue,
} from "../../services/venues.service.js";
import { sweepIneligibleSeats } from "../../services/eligibility.service.js";
import {
  listSupervisors,
  setSupervisor,
} from "../../services/supervision.service.js";
import { expireStaleProposals } from "../../services/proposals.service.js";
import { applyPromotionsAndRelegations } from "../../services/ranking.service.js";
import { adminProcedure, devProcedure, router } from "../init.js";
import { seedDemoData } from "../../db/seed-data.js";

/**
 * Console d'administration (CDC §15).
 * Toutes les procédures exigent users.role = 'admin' côté serveur : un joueur
 * ordinaire reçoit 403 sur l'intégralité de ce routeur (ADMIN-001, E2E-012).
 */
export const adminRouter = router({
  stats: adminProcedure.query(async () => ({
    counts: await adminService.databaseStats(db),
    roles: await adminService.roleCounts(db),
    // Contrôle de cohérence du registre financier (WAL-006).
    inconsistentBalances: await countInconsistentBalances(db),
    /** Propositions de produits en attente d'une décision (SHOP-009). */
    pendingSuggestions: await countPendingSuggestions(db),
  })),

  players: adminProcedure.input(adminListPlayersSchema).query(({ input }) =>
    adminService.listPlayers(db, {
      query: input.query,
      division: input.division,
      limit: input.limit,
      cursor: input.cursor ?? null,
    }),
  ),

  setDivision: adminProcedure
    .input(adminSetDivisionSchema)
    .mutation(({ ctx, input }) =>
      adminService.setDivision(
        { userId: ctx.identity.userId },
        {
          playerId: input.playerId,
          division: input.division,
          reason: input.reason,
        },
      ),
    ),

  adjustUno: adminProcedure
    .input(adminAdjustUnoSchema)
    .mutation(({ ctx, input }) =>
      adminService.adjustUno({ userId: ctx.identity.userId }, input),
    ),

  /**
   * Remise à zéro de tous les soldes (ADMIN-010).
   *
   * Le motif est exigé, et pas par formalisme : l'opération touche chaque
   * joueur de la ligue, et la ligne qui apparaîtra dans leur portefeuille
   * reprend ce texte. « Retrait du bonus de bienvenue » se comprend ; une
   * ligne muette passerait pour une erreur.
   */
  zeroAllBalances: adminProcedure
    .input(z.object({ reason: z.string().trim().min(3).max(120) }))
    .mutation(({ ctx, input }) =>
      adminService.zeroAllBalances({ userId: ctx.identity.userId }, input),
    ),

  /**
   * Suppression d'un compte joueur (ADMIN-012).
   *
   * Deux routes pour un seul geste, et la première n'est pas une politesse :
   * l'écran doit pouvoir annoncer ce qui sera perdu — un solde, surtout — et
   * nommer le motif d'un refus **avant** la confirmation. Découvrir après coup
   * qu'on ne pouvait pas donne le sentiment d'avoir cassé quelque chose.
   */
  previewPlayerDeletion: adminProcedure
    .input(z.object({ playerId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      accountDeletionService.previewAccountDeletion(
        { userId: ctx.identity.userId },
        input,
      ),
    ),

  deletePlayerAccount: adminProcedure
    .input(z.object({ playerId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      accountDeletionService.deleteAccount(
        { userId: ctx.identity.userId },
        input,
      ),
    ),

  // --- Boutique ------------------------------------------------------------

  shopItems: adminProcedure.query(() => adminService.listAllShopItems(db)),

  createShopItem: adminProcedure
    .input(shopItemInputSchema)
    .mutation(({ ctx, input }) =>
      adminService.createShopItem({ userId: ctx.identity.userId }, input),
    ),

  updateShopItem: adminProcedure
    .input(
      z.object({
        shopItemId: z.number().int().positive(),
        data: shopItemInputSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      adminService.updateShopItem(
        { userId: ctx.identity.userId },
        input.shopItemId,
        input.data,
      ),
    ),

  // --- Commandes -----------------------------------------------------------

  orders: adminProcedure
    .input(
      paginationSchema.extend({
        status: z
          .enum(["pending", "paid", "fulfilled", "cancelled", "refunded"])
          .optional(),
      }),
    )
    .query(({ input }) =>
      listAllOrders(db, {
        status: input.status,
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),

  /**
   * Fait avancer une commande. Une annulation ou un remboursement recrédite
   * automatiquement le joueur, dans la même transaction.
   */
  setOrderStatus: adminProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        status: z.enum(["paid", "fulfilled", "cancelled", "refunded"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      updateOrderStatus({ userId: ctx.identity.userId }, input),
    ),

  removeShopItem: adminProcedure
    .input(z.object({ shopItemId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      adminService.removeShopItem(
        { userId: ctx.identity.userId },
        input.shopItemId,
      ),
    ),

  // --- Sessions et matchs --------------------------------------------------

  reportMatch: adminProcedure
    .input(reportMatchSchema)
    .mutation(({ ctx, input }) =>
      reportMatch({ userId: ctx.identity.userId }, input),
    ),

  validateMatch: adminProcedure
    .input(z.object({ matchId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      validateMatch({ userId: ctx.identity.userId }, input.matchId),
    ),

  /**
   * Accorde ou retire le droit de saisir les feuilles de match (SUP-001).
   *
   * Un joueur ne peut pas se l'attribuer : la saisie décide des récompenses
   * et des divisions.
   */
  setSupervisor: adminProcedure
    .input(setSupervisorSchema)
    .mutation(({ ctx, input }) =>
      setSupervisor({ userId: ctx.identity.userId }, input),
    ),

  supervisors: adminProcedure.query(() => listSupervisors(db)),

  /** Bascule un compte entre joueur et arbitre (ROLE-003). */
  setAccountType: adminProcedure
    .input(adminSetAccountTypeSchema)
    .mutation(({ ctx, input }) =>
      adminService.setAccountType({ userId: ctx.identity.userId }, input),
    ),

  /** Profil complet d'un joueur, pour le corriger (ADMIN-008). */
  player: adminProcedure
    .input(z.object({ playerId: z.number().int().positive() }))
    .query(({ input }) => playersService.getFullProfile(db, input.playerId)),

  /**
   * Correction d'un joueur (ADMIN-008).
   *
   * Le pendant des champs verrouillés côté joueur : nom, date de naissance,
   * adresse e-mail. Une faute de frappe à l'inscription arrive, et sans cette
   * route la seule issue serait un second compte — précisément ce que le
   * verrouillage évite.
   *
   * Division, type de compte et droit de supervision gardent leurs routes
   * propres : chacun déclenche des effets de bord qu'un patch générique
   * masquerait.
   */
  updatePlayer: adminProcedure
    .input(adminUpdatePlayerSchema)
    .mutation(({ ctx, input }) =>
      adminService.updatePlayerAsAdmin({ userId: ctx.identity.userId }, input),
    ),

  // --- Associations caritatives (SHOP-008) --------------------------------

  charities: adminProcedure.query(() => listAllCharities()),

  createCharity: adminProcedure
    .input(charityInputSchema)
    .mutation(({ ctx, input }) =>
      createCharity({ userId: ctx.identity.userId }, input),
    ),

  updateCharity: adminProcedure
    .input(
      z.object({
        charityId: z.number().int().positive(),
        data: charityInputSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      updateCharity({ userId: ctx.identity.userId }, input),
    ),

  // --- Propositions de produits (SHOP-009) --------------------------------

  suggestions: adminProcedure
    .input(
      z.object({
        status: shopSuggestionStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ input }) =>
      listSuggestions({ status: input.status, limit: input.limit }),
    ),

  decideSuggestion: adminProcedure
    .input(decideShopSuggestionSchema)
    .mutation(({ ctx, input }) =>
      decideSuggestion({ userId: ctx.identity.userId }, input),
    ),

  // --- Lieux (ADMIN-007) --------------------------------------------------

  venues: adminProcedure.query(() => listAllVenues()),

  createVenue: adminProcedure
    .input(venueInputSchema)
    .mutation(({ ctx, input }) =>
      createVenue({ userId: ctx.identity.userId }, input),
    ),

  updateVenue: adminProcedure
    .input(
      z.object({
        venueId: z.number().int().positive(),
        data: venueInputSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      updateVenue({ userId: ctx.identity.userId }, input),
    ),

  removeVenue: adminProcedure
    .input(z.object({ venueId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      removeVenue({ userId: ctx.identity.userId }, input.venueId),
    ),

  // --- Flux d'évènements (ADMIN-006) --------------------------------------

  events: adminProcedure.input(adminEventsSchema).query(({ input }) =>
    listAdminEvents({
      ...(input.category ? { category: input.category } : {}),
      unreadOnly: input.unreadOnly,
      limit: input.limit,
    }),
  ),

  eventCounts: adminProcedure.query(() => adminEventCounts()),

  markEventsRead: adminProcedure
    .input(markAdminEventsReadSchema)
    .mutation(({ input }) => markAdminEventsRead(input.throughId)),

  completeSession: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      completeSession({ userId: ctx.identity.userId }, input.proposalId),
    ),

  // --- Composition d'une session (ADMIN-008) ---------------------------------
  //
  // Inscrire et régler passent par les mêmes services qu'un joueur ordinaire.
  // L'administration ne déroge à rien : elle agit au nom d'un autre, et
  // l'audit le dit.

  /**
   * Ouvre une session depuis la console (ADMIN-008).
   *
   * Seule différence avec `proposals.create` : le préavis de deux jours ne
   * s'applique pas. Il protège les joueurs, à qui il laisse le temps de voir
   * passer la proposition ; il n'a rien à protéger quand l'administration
   * enregistre une séance d'aujourd'hui, ou d'hier.
   */
  /**
   * Déplacer une séance gratuite (MODE-003).
   *
   * Réservée à l'administration, et aux seuls modes sans participation : le
   * service refuse le reste. Une séance payée qui se déplace pose des
   * questions d'argent auxquelles cette route ne répond pas.
   */
  rescheduleProposal: adminProcedure
    .input(rescheduleProposalSchema)
    .mutation(({ ctx, input }) =>
      proposalsService.rescheduleProposal(
        { userId: ctx.identity.userId },
        input,
      ),
    ),

  createProposal: adminProcedure
    .input(createProposalSchema)
    .mutation(({ ctx, input }) => {
      requireSchedulableMode(input.modeId);
      return proposalsService.createProposal(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
        { skipLeadTime: true },
      );
    }),

  manageableProposals: adminProcedure.query(() => rosterService.listForAdmin()),

  eligiblePlayers: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .query(({ input }) => rosterService.eligibleFor(input.proposalId)),

  addParticipant: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        playerId: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      rosterService.addParticipant({ userId: ctx.identity.userId }, input),
    ),

  removeParticipant: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        playerId: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      rosterService.removeParticipant({ userId: ctx.identity.userId }, input),
    ),

  fillProposal: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      rosterService.fillProposal({ userId: ctx.identity.userId }, input),
    ),

  /** Second geste : régler les places, une fois le plateau complet. */
  settleProposal: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      rosterService.settleProposal({ userId: ctx.identity.userId }, input),
    ),

  // --- Suppressions (ADMIN-011) --------------------------------------------

  deletableProposals: adminProcedure.query(() =>
    purgeService.listDeletableProposals(),
  ),

  /**
   * Efface une session pour de bon.
   *
   * Le motif est exigé : la ligne disparaît, et l'entrée d'audit est tout ce
   * qui restera pour dire pourquoi. « Session d'essai » suffit ; rien du tout
   * ne suffit pas.
   */
  deleteProposal: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        reason: z.string().trim().min(3).max(120),
      }),
    )
    .mutation(({ ctx, input }) =>
      purgeService.deleteProposal({ userId: ctx.identity.userId }, input),
    ),

  squads: adminProcedure.query(() => purgeService.listSquadsForAdmin()),

  dissolveSquad: adminProcedure
    .input(
      z.object({
        squadId: z.number().int().positive(),
        reason: z.string().trim().min(3).max(120),
      }),
    )
    .mutation(({ ctx, input }) =>
      purgeService.dissolveSquad({ userId: ctx.identity.userId }, input),
    ),

  expireStale: adminProcedure.mutation(async () => {
    const stale = await expireStaleProposals();
    const seats = await sweepIneligibleSeats();
    return { ...stale, seats };
  }),

  /** Fin de saison (RANK-005) : les quotas viennent des paramètres, pas du code UI. */
  applySeasonLadder: adminProcedure
    .input(
      z.object({
        promotionCount: z.number().int().min(0).max(50),
        relegationCount: z.number().int().min(0).max(50),
        sort: z
          .enum(["points", "goals", "assists", "defenses", "saves", "motm"])
          .default("points"),
      }),
    )
    .mutation(({ input }) => applyPromotionsAndRelegations(input)),

  // --- Annonces ------------------------------------------------------------

  createAnnouncement: adminProcedure
    .input(announcementInputSchema)
    .mutation(({ ctx, input }) =>
      createAnnouncement({ userId: ctx.identity.userId }, input),
    ),

  // --- Audit ---------------------------------------------------------------

  auditLogs: adminProcedure.input(paginationSchema).query(({ input }) =>
    adminService.listAuditLogs(db, {
      limit: input.limit,
      cursor: input.cursor ?? null,
    }),
  ),

  /**
   * Jeu de données de démonstration.
   * `devProcedure` : indisponible en production, même pour un administrateur
   * (CDC §15 — les outils de seed ne sont jamais exposés en production).
   */
  seedDemoData: devProcedure.mutation(() => seedDemoData()),
});
