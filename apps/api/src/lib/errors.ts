import { TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { AppError, type ErrorCode } from "@uno/shared";
import { logger } from "./logger.js";

/**
 * Traduction des erreurs métier vers le protocole tRPC (CDC §18.1).
 *
 * Le client ne reçoit qu'un code stable et un message français ; jamais de
 * trace, de requête SQL ni de nom de table (UX §16, SEC-007).
 */

const HTTP_TO_TRPC: Record<number, TRPC_ERROR_CODE_KEY> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_CONTENT",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
};

export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;

  if (error instanceof AppError) {
    return new TRPCError({
      code: HTTP_TO_TRPC[error.httpStatus] ?? "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }

  // Toute autre erreur est un défaut du serveur : on la journalise avec sa
  // trace, mais le client ne reçoit qu'un message générique.
  logger.error({ err: error }, "Erreur non gérée");
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Une erreur est survenue. Veuillez réessayer.",
  });
}

/** Raccourci pour lever une erreur métier depuis un service. */
export function fail(
  code: ErrorCode,
  message?: string,
  fields?: Record<string, string>,
): never {
  throw new AppError(code, message, fields);
}

/**
 * Drizzle encapsule les erreurs du pilote dans une `DrizzleQueryError` dont le
 * message contient la requête SQL et ses paramètres. Il faut donc remonter la
 * chaîne des causes pour reconnaître le code d'erreur MySQL d'origine — et ne
 * jamais laisser fuiter ce message vers le client (SEC-007).
 */
function findDriverError(error: unknown): { code?: string; errno?: number } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const candidate = current as { code?: unknown; errno?: unknown; cause?: unknown };
      if (typeof candidate.code === "string" || typeof candidate.errno === "number") {
        return {
          ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
          ...(typeof candidate.errno === "number" ? { errno: candidate.errno } : {}),
        };
      }
      current = candidate.cause;
    } else {
      return null;
    }
  }
  return null;
}

/** Vrai si l'erreur MySQL correspond à une violation de contrainte d'unicité. */
export function isDuplicateKeyError(error: unknown): boolean {
  const driver = findDriverError(error);
  return driver?.code === "ER_DUP_ENTRY" || driver?.errno === 1062;
}

/** Vrai si l'erreur MySQL correspond à une violation de CHECK constraint. */
export function isCheckConstraintError(error: unknown): boolean {
  return findDriverError(error)?.errno === 3819;
}
