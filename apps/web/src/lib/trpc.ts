import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { AppError, ERROR_MESSAGES, type ErrorCode } from "@uno/shared";
import type { AppRouter } from "@uno/api/router";
import { isNative, sessionStore } from "./native.js";

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
}

/**
 * Traduit une erreur d'appel en information affichable.
 * Le serveur envoie déjà un message en français ; on ne compose jamais de
 * message technique côté client.
 */
export function describeError(error: unknown): ApiErrorInfo {
  if (error instanceof TRPCClientError) {
    const data = error.data as
      | { appCode?: string; fields?: Record<string, string>; httpStatus?: number }
      | undefined;

    const code = (data?.appCode ?? "UNKNOWN") as ApiErrorInfo["code"];
    return {
      code,
      message:
        error.message && !error.message.startsWith("[")
          ? error.message
          : (ERROR_MESSAGES[code as ErrorCode] ?? ERROR_MESSAGES.INTERNAL),
      fields: data?.fields ?? {},
      unauthenticated: data?.httpStatus === 401,
    };
  }

  // Les erreurs levées hors tRPC — téléversement d'image, validation locale —
  // portent déjà un message destiné à l'utilisateur. Les remplacer par un
  // message générique masquerait la seule information utile.
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      fields: error.fields ?? {},
      unauthenticated: error.code === "UNAUTHENTICATED",
    };
  }

  if (error instanceof Error && error.message.toLowerCase().includes("fetch")) {
    return {
      code: "UNKNOWN",
      message: "Connexion impossible. Vérifiez votre réseau.",
      fields: {},
      unauthenticated: false,
    };
  }

  return {
    code: "UNKNOWN",
    message: ERROR_MESSAGES.INTERNAL,
    fields: {},
    unauthenticated: false,
  };
}

/** Clé d'idempotence pour les opérations financières (STATE-002). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
