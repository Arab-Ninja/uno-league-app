import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { SESSION_COOKIE_NAME } from "../lib/cookies.js";
import {
  resolveSession,
  type AuthenticatedIdentity,
} from "../services/auth.service.js";

/**
 * Contexte de requête tRPC.
 *
 * L'identité est résolue à partir du cookie httpOnly (application web) ou de
 * l'en-tête Authorization (application native empaquetée avec Capacitor, où
 * les cookies tiers ne sont pas fiables). Aucun autre canal — corps de
 * requête, paramètre d'URL — ne peut établir une identité (SEC-002).
 */

export interface Context {
  identity: AuthenticatedIdentity | null;
  sessionToken: string | null;
  ip: string;
  userAgent: string | undefined;
  res: CreateExpressContextOptions["res"];
}

function extractToken(req: CreateExpressContextOptions["req"]): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim() || null;
  }
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[SESSION_COOKIE_NAME];
  return typeof fromCookie === "string" && fromCookie.length > 0
    ? fromCookie
    : null;
}

export async function createContext({
  req,
  res,
}: CreateExpressContextOptions): Promise<Context> {
  const sessionToken = extractToken(req);
  const identity = sessionToken ? await resolveSession(sessionToken) : null;

  return {
    identity,
    sessionToken,
    ip: req.ip ?? "unknown",
    userAgent: req.headers["user-agent"],
    res,
  };
}
