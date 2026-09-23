import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  HOME_ANNOUNCEMENTS,
  HOME_UPCOMING_SESSIONS,
  LOCALES,
  WALLET_RECENT_TRANSACTIONS,
  paginationSchema,
  updateProfileSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import { playerStatistics } from "../../services/statistics.service.js";
import {
  countUnread,
  listAnnouncements,
} from "../../services/announcements.service.js";
import { listTransactions } from "../../services/ledger.service.js";
import * as playersService from "../../services/players.service.js";
import {
  listHistoryForPlayer,
  listJoinableForPlayer,
  listUpcomingForPlayer,
} from "../../services/proposals.service.js";
import { playerPosition } from "../../services/ranking.service.js";
import {
  listNotifications,
  markNotificationsRead,
} from "../../services/notifications.service.js";
import { fcmEnabled } from "../../push/fcm.js";
import {
  publicKey,
  subscribe as subscribePush,
  subscriptionCount,
  unsubscribe as unsubscribePush,
} from "../../services/push.service.js";
import { protectedProcedure, router } from "../init.js";
import { traduireEcriture } from "../../i18n/index.js";

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
    .input(
      z.object({
        query: z.string().trim().min(2).max(50),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    )
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

  /** Statistiques détaillées : totaux, ratios par séance, évolution. */
  statistics: protectedProcedure
    .input(
      z.object({
        playerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(({ ctx, input }) =>
      playerStatistics(
        db,
        input.playerId ?? ctx.identity.playerId,
        input.limit,
      ),
    ),

  transactions: protectedProcedure
    .input(paginationSchema)
    .query(async ({ ctx, input }) => {
      const page = await listTransactions(db, {
        playerId: ctx.identity.playerId,
        limit: input.limit,
        cursor: input.cursor ?? null,
      });
      return {
        ...page,
        items: page.items.map((row) => ({
          ...row,
          description: traduireEcriture(ctx.locale, row.description),
        })),
      };
    }),

  /**
   * Agrégat du tableau de bord (CDC §7) : un seul aller-retour réseau pour
   * l'écran d'accueil, ce qui évite la cascade de spinners.
   */
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const profile = await playersService.getFullProfile(
      db,
      ctx.identity.playerId,
    );

    const [
      upcoming,
      joinable,
      announcements,
      unread,
      position,
      recentTransactions,
    ] = await Promise.all([
      listUpcomingForPlayer(ctx.identity.playerId, HOME_UPCOMING_SESSIONS),
      // Ce que l'inscrit pourrait rejoindre : l'accueil d'un joueur qui n'a
      // rien réservé ne doit pas lui laisser croire que la ligue est vide.
      //
      // Un arbitre n'a pas de division (ARB-002) et ne joue pas : lui
      // proposer des places à prendre n'aurait aucun sens.
      profile.division
        ? listJoinableForPlayer(
            { playerId: ctx.identity.playerId, division: profile.division },
            HOME_UPCOMING_SESSIONS,
          )
        : Promise.resolve([]),
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
      joinable,
      announcements: announcements.items,
      unreadAnnouncements: unread,
      rankingPosition: position,
      recentTransactions: recentTransactions.items.map((row) => ({
        ...row,
        description: traduireEcriture(ctx.locale, row.description),
      })),
    };
  }),

  /**
   * Choisir sa langue (I18N-001).
   *
   * Elle vit sur le compte et non sur l'appareil : un courriel part du serveur
   * des heures après, sans téléphone en face pour dire quelle langue lire. Le
   * joueur qui change de langue sur son téléphone la change donc partout, y
   * compris dans ses rappels de paiement.
   */
  setLocale: protectedProcedure
    .input(z.object({ locale: z.enum(LOCALES) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(players)
        .set({ locale: input.locale })
        .where(eq(players.id, ctx.identity.playerId));
      return { locale: input.locale };
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
    /*
     * Les deux routes sont indépendantes, et l'écran a besoin de le savoir :
     * dans l'application empaquetée, la clé VAPID ne dit rien de ce qui est
     * possible — c'est Firebase qui décide. Déduire l'un de l'autre aurait
     * affiché « non configuré » là où tout fonctionne.
     */
    nativeEnabled: fcmEnabled(),
    devices: await subscriptionCount(ctx.identity.playerId),
  })),

  /**
   * Enregistre un appareil (ANN-005).
   *
   * Deux formes acceptées, et l'union est discriminée plutôt que permissive :
   * un navigateur remet une URL d'endpoint et deux clés, une application
   * empaquetée remet un jeton Firebase. Accepter des champs facultatifs aurait
   * laissé passer un abonnement à moitié rempli — un appareil enregistré qui
   * ne recevrait jamais rien, sans que rien ne le signale.
   */
  subscribePush: protectedProcedure
    .input(
      z.discriminatedUnion("transport", [
        z.object({
          transport: z.literal("webpush").default("webpush"),
          endpoint: z.string().url().max(512),
          keys: z.object({
            p256dh: z.string().min(1).max(255),
            auth: z.string().min(1).max(255),
          }),
          platform: z.enum(["ios", "android", "web"]).default("web"),
        }),
        z.object({
          transport: z.literal("fcm"),
          // Un jeton Firebase fait environ 160 caractères ; la colonne en
          // accepte 512, ce qui laisse de la marge sans ouvrir la porte à
          // n'importe quoi.
          token: z.string().min(1).max(512),
          platform: z.enum(["ios", "android", "web"]).default("web"),
        }),
      ]),
    )
    .mutation(({ ctx, input }) => subscribePush(ctx.identity.playerId, input)),

  /**
   * Retire un appareil.
   *
   * `handle` est ce que l'appareil sait dire de lui-même : son endpoint pour
   * un navigateur, son jeton pour une application. Le serveur reconnaît les
   * deux, parce qu'un appelant ne connaît que le sien.
   */
  unsubscribePush: protectedProcedure
    .input(z.object({ handle: z.string().min(1).max(512) }))
    .mutation(({ ctx, input }) =>
      unsubscribePush(ctx.identity.playerId, input.handle),
    ),
});
