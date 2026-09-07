import { initTRPC, TRPCError } from "@trpc/server";
import { AppError, ERROR_MESSAGES, isErrorCode } from "@uno/shared";
import superjson from "superjson";
import { ZodError } from "zod";
import { env } from "../env.js";
import { isSchemaDriftError, toTRPCError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { Context } from "./context.js";

/**
 * Initialisation tRPC et briques d'autorisation (ROLE-001, SEC-002).
 *
 * Trois niveaux de procédure :
 *   publicProcedure    — aucune identité requise (login, catalogue public) ;
 *   protectedProcedure — session valide obligatoire, sinon 401 ;
 *   adminProcedure     — session valide ET users.role = 'admin', sinon 403.
 *
 * Le rôle est relu en base à chaque requête par `createContext` : un client
 * ne peut jamais devenir administrateur en modifiant un état local.
 */

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;

    // Erreur de validation : messages par champ, en français.
    if (cause instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of cause.issues) {
        const path = issue.path.join(".") || "_";
        if (!fields[path]) fields[path] = issue.message;
      }
      return {
        ...shape,
        message: "Certaines informations saisies sont invalides.",
        data: {
          ...shape.data,
          appCode: "VALIDATION_ERROR",
          fields,
          // Jamais de trace technique côté client (SEC-007).
          stack: undefined,
        },
      };
    }

    const isInternal = error.code === "INTERNAL_SERVER_ERROR";
    const appCode =
      cause instanceof AppError && isErrorCode(cause.code)
        ? cause.code
        : isInternal
          ? "INTERNAL"
          : undefined;

    if (isInternal) {
      // Le message d'une erreur interne peut contenir une requête SQL, des
      // paramètres liés, voire un hash de mot de passe. Il est journalisé
      // côté serveur mais JAMAIS renvoyé au client (SEC-007).
      logger.error({ err: error.cause ?? error, code: error.code }, "erreur interne");

      // Une colonne ou une table inconnue signifie presque toujours que les
      // migrations n'ont pas été appliquées. Le client ne doit rien en savoir,
      // mais l'exploitant, si : sans cela, le seul indice est un message
      // générique côté application.
      if (isSchemaDriftError(error.cause ?? error)) {
        logger.error(
          "Le schéma de la base ne correspond pas au code. Lancez : pnpm db:migrate",
        );
      }
      return {
        ...shape,
        message: ERROR_MESSAGES.INTERNAL,
        data: { ...shape.data, appCode: "INTERNAL", stack: undefined },
      };
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        appCode,
        fields: cause instanceof AppError ? cause.fields : undefined,
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;
export const createCallerFactory = t.createCallerFactory;

/** Journalise la durée et l'issue de chaque appel (NFR-005). */
const observability = middleware(async ({ path, type, next, ctx }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;

  const base = {
    path,
    type,
    durationMs,
    userId: ctx.identity?.userId ?? null,
  };

  if (result.ok) {
    logger.debug(base, "trpc ok");
  } else {
    logger.warn({ ...base, code: result.error.code }, "trpc erreur");
  }
  return result;
});

/**
 * Traduit les erreurs métier en erreurs de protocole (CDC §18.1).
 *
 * Sans ce maillon, tRPC classe toute exception non-TRPCError en 500 : une
 * règle métier légitime (email déjà pris, solde insuffisant, session
 * complète) ressortirait en erreur serveur au lieu de son code réel.
 */
const mapDomainErrors = middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    throw toTRPCError(result.error.cause);
  }
  return result;
});

export const publicProcedure = t.procedure.use(mapDomainErrors).use(observability);

const requireAuth = middleware(({ ctx, next }) => {
  if (!ctx.identity) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Votre session a expiré. Veuillez vous reconnecter.",
    });
  }
  return next({ ctx: { ...ctx, identity: ctx.identity } });
});

const requireAdmin = middleware(({ ctx, next }) => {
  if (!ctx.identity) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Votre session a expiré. Veuillez vous reconnecter.",
    });
  }
  if (ctx.identity.role !== "admin") {
    // ROLE-001 : refus avant toute mutation, et trace pour détecter les
    // tentatives d'escalade de privilèges.
    logger.warn(
      { userId: ctx.identity.userId },
      "tentative d'accès administrateur refusée",
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vous n'avez pas les droits nécessaires pour cette action.",
    });
  }
  return next({ ctx: { ...ctx, identity: ctx.identity } });
});

const requireDevTools = middleware(({ next }) => {
  if (!env.ENABLE_DEV_TOOLS || env.NODE_ENV === "production") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Outil indisponible sur cet environnement.",
    });
  }
  return next();
});

export const protectedProcedure = publicProcedure.use(requireAuth);
export const adminProcedure = publicProcedure.use(requireAdmin);
/** Routes de seed/test : jamais exposées en production (CDC §15). */
export const devProcedure = adminProcedure.use(requireDevTools);
