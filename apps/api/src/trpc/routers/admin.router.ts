import { z } from "zod";
import {
  adminAdjustUnoSchema,
  adminEventsSchema,
  adminListPlayersSchema,
  adminSetAccountTypeSchema,
  adminSetDivisionSchema,
  addMatchSchema,
  announcementInputSchema,
  assignTeamSchema,
  markAdminEventsReadSchema,
  paginationSchema,
  nextPairing,
  recordSessionSchema,
  removeMatchSchema,
  reportMatchSchema,
  shopItemInputSchema,
  venueInputSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import * as adminService from "../../services/admin.service.js";
import { createAnnouncement } from "../../services/announcements.service.js";
import { countInconsistentBalances } from "../../services/ledger.service.js";
import {
  listAllOrders,
  updateOrderStatus,
} from "../../services/orders.service.js";
import {
  addMatch,
  assignPlayerToTeam,
  completeSession,
  generateTeams,
  listMatches,
  readTeams,
  recordSession,
  removeMatch,
  reportMatch,
  validateMatch,
  sessionScoreboard,
} from "../../services/matches.service.js";
import {
  adminEventCounts,
  listAdminEvents,
  markAdminEventsRead,
} from "../../services/admin-events.service.js";
import {
  createVenue,
  listAllVenues,
  removeVenue,
  updateVenue,
} from "../../services/venues.service.js";
import { sweepIneligibleSeats } from "../../services/eligibility.service.js";
import {
  expireStaleProposals,
  pendingSessions,
} from "../../services/proposals.service.js";
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
    // Contrôle de cohérence du registre financier (WAL-006).
    inconsistentBalances: await countInconsistentBalances(db),
  })),

  players: adminProcedure
    .input(adminListPlayersSchema)
    .query(({ input }) =>
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

  // --- Boutique ------------------------------------------------------------

  shopItems: adminProcedure.query(() => adminService.listAllShopItems(db)),

  createShopItem: adminProcedure
    .input(shopItemInputSchema)
    .mutation(({ ctx, input }) =>
      adminService.createShopItem({ userId: ctx.identity.userId }, input),
    ),

  updateShopItem: adminProcedure
    .input(z.object({ shopItemId: z.number().int().positive(), data: shopItemInputSchema }))
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
      adminService.removeShopItem({ userId: ctx.identity.userId }, input.shopItemId),
    ),

  // --- Sessions et matchs --------------------------------------------------

  generateTeams: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      generateTeams({ userId: ctx.identity.userId }, input.proposalId),
    ),

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
   * Saisie complète d'une session (MATCH-003).
   * Tous les matchs d'un coup, puis clôture : distinctions, récompenses et
   * mouvements de division en découlent automatiquement.
   */
  recordSession: adminProcedure
    .input(recordSessionSchema)
    .mutation(({ ctx, input }) =>
      recordSession({ userId: ctx.identity.userId }, input),
    ),

  /** Sessions jouées dont les résultats restent à saisir (MATCH-003). */
  pendingSessions: adminProcedure.query(() => pendingSessions()),

  /**
   * Feuille de saisie : équipes, matchs, statistiques et affiche suggérée.
   *
   * La suggestion applique la règle du terrain — le vainqueur reste, l'équipe
   * entrante reste en cas de nul — pour que l'administration n'ait qu'à
   * confirmer dans le cas courant.
   */
  sessionSheet: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [squads, played] = await Promise.all([
        readTeams(db, input.proposalId),
        listMatches(db, input.proposalId),
      ]);

      const last = played.at(-1);
      return {
        teams: squads,
        matches: played,
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

  /** Ajoute un match à une session UNO League (MATCH-001). */
  addMatch: adminProcedure
    .input(addMatchSchema)
    .mutation(({ ctx, input }) =>
      addMatch({ userId: ctx.identity.userId }, input),
    ),

  removeMatch: adminProcedure
    .input(removeMatchSchema)
    .mutation(({ ctx, input }) =>
      removeMatch({ userId: ctx.identity.userId }, input.matchId),
    ),

  /** Déplace un joueur vers une autre équipe de la session. */
  assignTeam: adminProcedure
    .input(assignTeamSchema)
    .mutation(({ ctx, input }) =>
      assignPlayerToTeam({ userId: ctx.identity.userId }, input),
    ),

  /** Bascule un compte entre joueur et arbitre (ROLE-003). */
  setAccountType: adminProcedure
    .input(adminSetAccountTypeSchema)
    .mutation(({ ctx, input }) =>
      adminService.setAccountType({ userId: ctx.identity.userId }, input),
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

  events: adminProcedure
    .input(adminEventsSchema)
    .query(({ input }) =>
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

  auditLogs: adminProcedure
    .input(paginationSchema)
    .query(({ input }) =>
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
