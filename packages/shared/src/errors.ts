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

/**
 * Une valeur glissée dans un message d'erreur.
 *
 * Un nombre ou un nom propre passe tel quel : « 5 joueurs », « Les Loups ».
 * Un **libellé** — un statut de commande, un tour de tournoi — se traduit
 * lui aussi, et c'est pourquoi il voyage sous forme de famille et de clé
 * plutôt que de mot français : « Une commande expédiée » deviendrait sinon
 * « An order expédiée ».
 */
export type ErrorValue =
  | string
  | number
  | { libelle: ErrorLabelFamily; cle: string }
  /** Un jour civil `AAAA-MM-JJ`, écrit en toutes lettres dans la langue. */
  | { jour: string }
  /** Un instant, date et heure courtes, à l'heure du fuseau donné. */
  | { instant: string; fuseau: string };

/** Le code de langue complet de chaque langue, pour les API `Intl`. */
const BCP47: Record<string, string> = {
  fr: "fr-BE",
  en: "en-GB",
  nl: "nl-BE",
};

function ecrireValeur(
  valeur: Exclude<ErrorValue, string | number>,
  libelles: Record<ErrorLabelFamily, Record<string, string>>,
  langue: string,
): string {
  if ("libelle" in valeur) {
    return libelles[valeur.libelle]?.[valeur.cle] ?? valeur.cle;
  }
  const bcp47 = BCP47[langue] ?? "fr-BE";
  if ("jour" in valeur) {
    // Midi UTC : aucun fuseau ne fait basculer le jour.
    const date = new Date(`${valeur.jour}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return valeur.jour;
    return date.toLocaleDateString(bcp47, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  const instant = new Date(valeur.instant);
  if (Number.isNaN(instant.getTime())) return valeur.instant;
  return instant.toLocaleString(bcp47, {
    timeZone: valeur.fuseau,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Les familles de libellés qu'un message d'erreur peut citer. */
export type ErrorLabelFamily = "orderStatus" | "tournamentRound" | "team";

/**
 * Un message d'erreur à trous, et ce qui les remplit (I18N-002).
 *
 * **Le gabarit français est la clé.** Le serveur le retrouve dans son
 * catalogue et le rend dans la langue du joueur qui a fait la requête ; le
 * français reste le message de l'erreur elle-même, pour les journaux et pour
 * les tests. Écrire le gabarit en toutes lettres à l'endroit où l'erreur est
 * levée garde le code lisible — on voit ce que le joueur lira.
 */
export interface ErrorTemplate {
  gabarit: string;
  valeurs: Record<string, ErrorValue>;
}

/** Un message à trous : `gabarit("L'équipe {side} est complète.", { side })`. */
export function gabarit(
  texte: string,
  valeurs: Record<string, ErrorValue> = {},
): ErrorTemplate {
  return { gabarit: texte, valeurs };
}

/**
 * Les libellés français des familles citées dans les messages.
 *
 * Recopiés plutôt qu'importés : `states.ts` et `tournaments.ts` importent ce
 * module, et l'inverse formerait un cycle. Un test vérifie qu'ils ne
 * s'écartent pas des libellés d'origine.
 */
export const ERROR_LABELS_FR: Record<
  ErrorLabelFamily,
  Record<string, string>
> = {
  orderStatus: {
    pending: "en attente",
    paid: "payée",
    fulfilled: "livrée",
    cancelled: "annulée",
    refunded: "remboursée",
  },
  tournamentRound: {
    of32: "16es de finale",
    of16: "8es de finale",
    quarter: "quarts de finale",
    semi: "demi-finales",
    final: "finale",
  },
  team: {
    "0": "Équipe A",
    "1": "Équipe B",
    "2": "Équipe C",
    "3": "Équipe D",
  },
};

/**
 * Remplit un gabarit. Exporté parce que le serveur s'en sert aussi pour les
 * autres langues, avec ses propres libellés.
 */
export function remplirGabarit(
  texte: string,
  valeurs: Record<string, ErrorValue>,
  libelles: Record<ErrorLabelFamily, Record<string, string>> = ERROR_LABELS_FR,
  langue = "fr",
): string {
  return texte.replace(/\{(\w+)\}/g, (entier, nom: string) => {
    const valeur = valeurs[nom];
    if (valeur === undefined) return entier;
    if (typeof valeur === "object")
      return ecrireValeur(valeur, libelles, langue);
    return String(valeur);
  });
}

/** Un texte fixe devient un gabarit sans trou : tout se traduit pareil. */
function enGabarit(texte: string | ErrorTemplate): ErrorTemplate {
  return typeof texte === "string" ? { gabarit: texte, valeurs: {} } : texte;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  /** Les messages par champ, en français. */
  readonly fields: Record<string, string> | undefined;
  /** Le texte à traduire : le gabarit, ou le message fixe lui-même. */
  readonly gabarit: string;
  readonly valeurs: Record<string, ErrorValue>;
  /** Les messages par champ, sous leur forme traduisible. */
  readonly champs: Record<string, ErrorTemplate> | undefined;

  constructor(
    code: ErrorCode,
    message?: string | ErrorTemplate,
    fields?: Record<string, string | ErrorTemplate>,
  ) {
    const modele = enGabarit(message ?? ERROR_MESSAGES[code]);
    super(remplirGabarit(modele.gabarit, modele.valeurs));
    this.name = "AppError";
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.gabarit = modele.gabarit;
    this.valeurs = modele.valeurs;
    if (fields) {
      const champs: Record<string, ErrorTemplate> = {};
      const francais: Record<string, string> = {};
      for (const [nom, texte] of Object.entries(fields)) {
        const modeleChamp = enGabarit(texte);
        champs[nom] = modeleChamp;
        francais[nom] = remplirGabarit(
          modeleChamp.gabarit,
          modeleChamp.valeurs,
        );
      }
      this.champs = champs;
      this.fields = francais;
    } else {
      this.champs = undefined;
      this.fields = undefined;
    }
  }

  toPayload(): AppErrorPayload {
    return this.fields
      ? { code: this.code, message: this.message, fields: this.fields }
      : { code: this.code, message: this.message };
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (ERROR_CODES as readonly string[]).includes(value)
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
