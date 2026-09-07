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
interface DriverError {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

/**
 * Renvoie l'erreur du pilote MySQL trouvée dans la chaîne des causes, avec
 * tous ses champs. En extraire une copie partielle ferait perdre
 * `sqlMessage`, qui est précisément l'information exploitable : « Unknown
 * column 'position' » plutôt qu'une requête SQL de trois lignes.
 */
function findDriverError(error: unknown): DriverError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const candidate = current as {
        code?: unknown;
        errno?: unknown;
        sqlMessage?: unknown;
        cause?: unknown;
      };
      if (typeof candidate.code === "string" || typeof candidate.errno === "number") {
        return {
          ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
          ...(typeof candidate.errno === "number" ? { errno: candidate.errno } : {}),
          ...(typeof candidate.sqlMessage === "string"
            ? { sqlMessage: candidate.sqlMessage }
            : {}),
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

/**
 * Vrai lorsque l'erreur traduit un schéma de base en retard sur le code :
 * colonne ou table inconnue. C'est le symptôme d'une migration non appliquée,
 * et il se manifeste autrement par un simple « une erreur est survenue ».
 */
export function isSchemaDriftError(error: unknown): boolean {
  const driver = findDriverError(error);
  return (
    driver?.code === "ER_BAD_FIELD_ERROR" ||
    driver?.errno === 1054 ||
    driver?.code === "ER_NO_SUCH_TABLE" ||
    driver?.errno === 1146
  );
}

/**
 * Résumé technique d'une erreur, destiné au développeur qui exploite
 * l'application sur sa propre machine.
 *
 * Ne remonte que le code du pilote et son message — jamais la requête ni ses
 * paramètres liés, qui peuvent contenir un hash de mot de passe ou des
 * données personnelles. Le message est tronqué et n'est diffusé qu'en
 * développement (voir l'appelant).
 */
export function describeCause(error: unknown): string | undefined {
  const driver = findDriverError(error);

  const parts: string[] = [];
  if (driver?.code) parts.push(driver.code);
  if (driver?.sqlMessage) {
    parts.push(driver.sqlMessage.slice(0, 200));
  } else if (error instanceof Error) {
    parts.push(error.message.split("\n")[0]?.slice(0, 200) ?? "");
  }

  const summary = parts.filter(Boolean).join(" — ");
  return summary.length > 0 ? summary : undefined;
}
