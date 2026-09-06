import { z } from "zod";
import {
  changePasswordSchema,
  loginSchema,
  signupSchema,
  type SessionUser,
} from "@uno/shared";
import { clearSessionCookie, setSessionCookie } from "../../lib/cookies.js";
import * as authService from "../../services/auth.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

/**
 * Routes d'authentification (CDC §6).
 *
 * Le jeton est renvoyé dans la réponse ET posé en cookie httpOnly :
 *  - le navigateur utilise le cookie, inaccessible au JavaScript ;
 *  - l'application native empaquetée (Capacitor) conserve le jeton dans le
 *    stockage sécurisé de l'appareil et l'envoie en en-tête Authorization,
 *    car les cookies ne sont pas fiables dans une WebView.
 * Dans les deux cas, aucun mot de passe n'est jamais stocké côté client.
 */
export const authRouter = router({
  /** Session courante (AUTH-006). Renvoie null si non connecté. */
  me: publicProcedure.query(({ ctx }): SessionUser | null => {
    if (!ctx.identity) return null;
    return {
      id: ctx.identity.userId,
      email: ctx.identity.email,
      role: ctx.identity.role,
      playerId: ctx.identity.playerId,
    };
  }),

  signup: publicProcedure
    .input(signupSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await authService.signup(input, {
        userAgent: ctx.userAgent,
      });
      setSessionCookie(ctx.res, result.token, result.expiresAt);
      return {
        token: result.token,
        user: {
          id: result.identity.userId,
          email: result.identity.email,
          role: result.identity.role,
          playerId: result.identity.playerId,
        } satisfies SessionUser,
      };
    }),

  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const result = await authService.login(input, { userAgent: ctx.userAgent });
    setSessionCookie(ctx.res, result.token, result.expiresAt);
    return {
      token: result.token,
      user: {
        id: result.identity.userId,
        email: result.identity.email,
        role: result.identity.role,
        playerId: result.identity.playerId,
      } satisfies SessionUser,
    };
  }),

  /** Déconnexion (AUTH-005) : session détruite en base et cookie effacé. */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await authService.logout(ctx.sessionToken);
    clearSessionCookie(ctx.res);
    return { success: true };
  }),

  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      await authService.changePassword({
        userId: ctx.identity.userId,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      // Toutes les sessions ont été révoquées, celle-ci comprise.
      clearSessionCookie(ctx.res);
      return { success: true };
    }),

  /** Enregistre un appareil pour les notifications push (ANN-003). */
  registerDevice: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["ios", "android", "web"]),
        pushToken: z.string().trim().min(8).max(512),
      }),
    )
    .mutation(async () => {
      // Le stockage du jeton est traité par le routeur des notifications.
      return { success: true };
    }),
});
