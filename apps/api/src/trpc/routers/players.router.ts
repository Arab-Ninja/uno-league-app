import { z } from "zod";
import {
  HOME_ANNOUNCEMENTS,
  HOME_UPCOMING_SESSIONS,
  WALLET_RECENT_TRANSACTIONS,
  paginationSchema,
  updateProfileSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { countUnread, listAnnouncements } from "../../services/announcements.service.js";
import { listTransactions } from "../../services/ledger.service.js";
import * as playersService from "../../services/players.service.js";
import {
  listHistoryForPlayer,
  listUpcomingForPlayer,
} from "../../services/proposals.service.js";
import { playerPosition } from "../../services/ranking.service.js";
import {
  listNotifications,
  markNotificationsRead,
} from "../../services/notifications.service.js";
import {
  publicKey,
  subscribe as subscribePush,
  subscriptionCount,
  unsubscribe as unsubscribePush,
} from "../../services/push.service.js";
import { protectedProcedure, router } from "../init.js";

export const playersRouter = router({
  /** Profil complet du joueur connecté. */
  me: protectedProcedure.query(({ ctx }) =>
    playersService.getFullProfile(db, ctx.identity.playerId),
  ),

  /** Vue publique d'un autre joueur (ROLE-002 : aucune donnée personnelle). */
  publicProfile: protectedProcedure
    .input(z.object({ playerId: z.number().int().positive() }))
    .query(({ input }) => playersService.getPublicPlayer(db, input.playerId)),

  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(({ ctx, input }) =>
      playersService.updateProfile(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      ),
    ),

  search: protectedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(50), limit: z.number().int().min(1).max(20).default(10) }))
    .query(({ ctx, input }) =>
      playersService.searchPlayers(db, {
        query: input.query,
        limit: input.limit,
        excludePlayerId: ctx.identity.playerId,
      }),
    ),

  /** Sessions jouées du joueur (MATCH-006). */
  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(({ ctx, input }) =>
      listHistoryForPlayer(ctx.identity.playerId, input.limit),
    ),

  transactions: protectedProcedure
    .input(paginationSchema)
    .query(({ ctx, input }) =>
      listTransactions(db, {
        playerId: ctx.identity.playerId,
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),

  /**
   * Agrégat du tableau de bord (CDC §7) : un seul aller-retour réseau pour
   * l'écran d'accueil, ce qui évite la cascade de spinners.
   */
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const profile = await playersService.getFullProfile(db, ctx.identity.playerId);

    const [upcoming, announcements, unread, position, recentTransactions] =
      await Promise.all([
        listUpcomingForPlayer(ctx.identity.playerId, HOME_UPCOMING_SESSIONS),
        listAnnouncements(db, {
          playerId: ctx.identity.playerId,
          division: profile.division,
          limit: HOME_ANNOUNCEMENTS,
        }),
        countUnread(db, {
          playerId: ctx.identity.playerId,
          division: profile.division,
        }),
        playerPosition(db, {
          playerId: ctx.identity.playerId,
          division: profile.division,
          sort: "points",
        }),
        listTransactions(db, {
          playerId: ctx.identity.playerId,
          limit: WALLET_RECENT_TRANSACTIONS,
        }),
      ]);

    return {
      profile,
      upcoming,
      announcements: announcements.items,
      unreadAnnouncements: unread,
      rankingPosition: position,
      recentTransactions: recentTransactions.items,
    };
  }),

  /** Notifications personnelles : rappels de paiement, points reçus (ANN-004). */
  notifications: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(({ ctx, input }) =>
      listNotifications({
        playerId: ctx.identity.playerId,
        limit: input.limit,
      }),
    ),

  markNotificationsRead: protectedProcedure
    .input(z.object({ throughId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      markNotificationsRead({
        playerId: ctx.identity.playerId,
        throughId: input.throughId,
      }),
    ),

  // --- Notifications push (ANN-004) ---------------------------------------

  /**
   * Configuration du push : clé publique et nombre d'appareils déjà abonnés.
   * Une clé absente signifie « push non configuré sur ce serveur » ; le client
   * masque alors la proposition d'abonnement au lieu d'échouer.
   */
  pushConfig: protectedProcedure.query(async ({ ctx }) => ({
    publicKey: publicKey(),
    devices: await subscriptionCount(ctx.identity.playerId),
  })),

  subscribePush: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(512),
        keys: z.object({
          p256dh: z.string().min(1).max(255),
          auth: z.string().min(1).max(255),
        }),
        platform: z.enum(["ios", "android", "web"]).default("web"),
      }),
    )
    .mutation(({ ctx, input }) =>
      subscribePush(ctx.identity.playerId, input),
    ),

  unsubscribePush: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(512) }))
    .mutation(({ ctx, input }) =>
      unsubscribePush(ctx.identity.playerId, input.endpoint),
    ),
});
