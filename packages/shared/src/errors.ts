/**
 * Codes d'erreur métier partagés client/serveur (CDC §18.1 et §19).
 *
 * Le serveur ne renvoie jamais de trace technique ni de détail base de
 * données au client (SEC-007) : il renvoie un code stable et un message
 * utilisateur en français, que l'interface peut afficher tel quel.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "EMAIL_ALREADY_USED",
  "INVALID_CREDENTIALS",
  "CONFLICT",
  "PROPOSAL_FULL",
  "PROPOSAL_CLOSED",
  "ALREADY_PAID",
  "NOT_PARTICIPANT",
  "INSUFFICIENT_FUNDS",
  "RULE_VIOLATION",
  "PAYMENT_FAILED",
  "PRODUCT_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_ALREADY_USED: 409,
  INVALID_CREDENTIALS: 401,
  CONFLICT: 409,
  PROPOSAL_FULL: 409,
  PROPOSAL_CLOSED: 409,
  ALREADY_PAID: 409,
  NOT_PARTICIPANT: 403,
  INSUFFICIENT_FUNDS: 422,
  RULE_VIOLATION: 422,
  PAYMENT_FAILED: 422,
  PRODUCT_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Messages par défaut, en français, affichables directement (UX §16). */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Certaines informations saisies sont invalides.",
  UNAUTHENTICATED: "Votre session a expiré. Veuillez vous reconnecter.",
  FORBIDDEN: "Vous n'avez pas les droits nécessaires pour cette action.",
  NOT_FOUND: "Cet élément est introuvable.",
  EMAIL_ALREADY_USED: "Email déjà utilisé.",
  INVALID_CREDENTIALS: "Email ou mot de passe incorrect.",
  CONFLICT: "Cette action entre en conflit avec l'état actuel.",
  PROPOSAL_FULL: "Cette session est complète.",
  PROPOSAL_CLOSED: "Les inscriptions pour cette session sont closes.",
  ALREADY_PAID: "Votre participation est déjà payée.",
  NOT_PARTICIPANT: "Vous ne participez pas à cette session.",
  INSUFFICIENT_FUNDS: "Vous n'avez pas assez de points UNO.",
  RULE_VIOLATION: "Cette action ne respecte pas les règles de la ligue.",
  PAYMENT_FAILED: "Le paiement n'a pas abouti.",
  PRODUCT_UNAVAILABLE: "Ce produit n'est plus disponible.",
  RATE_LIMITED: "Trop de tentatives. Réessayez dans quelques instants.",
  INTERNAL: "Une erreur est survenue. Veuillez réessayer.",
};

export interface AppErrorPayload {
  code: ErrorCode;
  message: string;
  /** Détails de validation par champ, jamais de détail technique. */
  fields?: Record<string, string>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly fields: Record<string, string> | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    fields?: Record<string, string>,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.fields = fields;
  }

  toPayload(): AppErrorPayload {
    return this.fields
      ? { code: this.code, message: this.message, fields: this.fields }
      : { code: this.code, message: this.message };
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Extrait un message affichable depuis une erreur quelconque. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    isErrorCode((error as { code: unknown }).code)
  ) {
    const code = (error as { code: ErrorCode }).code;
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && message.length > 0
      ? message
      : ERROR_MESSAGES[code];
  }
  return ERROR_MESSAGES.INTERNAL;
}
