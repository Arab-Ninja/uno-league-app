import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { AppError, ERROR_MESSAGES, type ErrorCode } from "@uno/shared";
import type { AppRouter } from "@uno/api/router";
import { isNative, sessionStore } from "./native.js";
import { traduire } from "@/lib/i18n.js";

/** Client tRPC typé à partir du routeur serveur (CDC §18). */
export const trpc = createTRPCReact<AppRouter>();

/**
 * En développement web, Vite relaie `/trpc` vers l'API : même origine, donc
 * pas de CORS ni de cookie tiers. En production, et dans l'application
 * empaquetée, l'URL absolue de l'API est injectée à la compilation.
 */
function apiUrl(): string {
  const base = import.meta.env["VITE_API_URL"];
  if (typeof base === "string" && base.length > 0) {
    return `${base.replace(/\/$/, "")}/trpc`;
  }
  return "/trpc";
}

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: apiUrl(),
        transformer: superjson,
        // Le cookie httpOnly voyage avec chaque requête côté web.
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
        async headers() {
          // Dans l'application empaquetée, la session voyage en en-tête.
          if (!isNative) return {};
          const token = await sessionStore.get();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export interface ApiErrorInfo {
  code: ErrorCode | "UNKNOWN";
  message: string;
  fields: Record<string, string>;
  /** true si la session a expiré : l'application doit revenir au login. */
  unauthenticated: boolean;
  /**
   * Cause technique, renseignée uniquement par un serveur de développement.
   * Absente en production.
   */
  devCause?: string;
}

/**
 * Le message d'une erreur, dans la langue de l'interface quand c'est possible
 * (I18N-001).
 *
 * **Seuls les messages génériques sont traduits.** Le serveur en envoie deux
 * sortes : le message par défaut du code — « Vous n'avez pas assez de points
 * UNO » —, et une phrase écrite pour un cas précis. La première est
 * reconnaissable, parce qu'elle vaut exactement `ERROR_MESSAGES[code]`, lu
 * ici depuis le même module partagé : la comparaison ne peut pas dériver. La
 * seconde passe telle quelle, en français, faute de quoi il faudrait
 * remonter la langue du lecteur jusqu'au fond des services.
 *
 * Ce n'est donc pas complet, et c'est dit franchement : un néerlandophone à
 * qui l'on refuse une place pour une raison particulière lira encore du
 * français. Mais les erreurs qu'on rencontre tous les jours — session
 * expirée, solde insuffisant, session complète — sont précisément celles qui
 * n'ont pas de message particulier.
 */
function messageDErreur(code: ApiErrorInfo["code"], recu: string): string {
  const defaut =
    code === "UNKNOWN" ? undefined : ERROR_MESSAGES[code as ErrorCode];
  if (defaut !== undefined && recu === defaut) {
    return traduire(`errors.${code as ErrorCode}`);
  }
  return recu;
}

/**
 * Traduit une erreur d'appel en information affichable.
 * On ne compose jamais de message technique côté client.
 */
export function describeError(error: unknown): ApiErrorInfo {
  if (error instanceof TRPCClientError) {
    const data = error.data as
      | {
          appCode?: string;
          fields?: Record<string, string>;
          httpStatus?: number;
          devCause?: string;
        }
      | undefined;

    const code = (data?.appCode ?? "UNKNOWN") as ApiErrorInfo["code"];
    return {
      code,
      message:
        error.message && !error.message.startsWith("[")
          ? messageDErreur(code, error.message)
          : traduire(
              code === "UNKNOWN"
                ? "errors.INTERNAL"
                : `errors.${code as ErrorCode}`,
            ),
      fields: data?.fields ?? {},
      unauthenticated: data?.httpStatus === 401,
      ...(data?.devCause ? { devCause: data.devCause } : {}),
    };
  }

  // Les erreurs levées hors tRPC — téléversement d'image, validation locale —
  // portent déjà un message destiné à l'utilisateur. Les remplacer par un
  // message générique masquerait la seule information utile.
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: messageDErreur(error.code, error.message),
      fields: error.fields ?? {},
      unauthenticated: error.code === "UNAUTHENTICATED",
    };
  }

  if (error instanceof Error && error.message.toLowerCase().includes("fetch")) {
    return {
      code: "UNKNOWN",
      message: traduire("errors.OFFLINE"),
      fields: {},
      unauthenticated: false,
    };
  }

  return {
    code: "UNKNOWN",
    message: traduire("errors.INTERNAL"),
    fields: {},
    unauthenticated: false,
  };
}

/** Clé d'idempotence pour les opérations financières (STATE-002). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
