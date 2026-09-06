import { serialize } from "cookie";
import type { Response } from "express";
import { env } from "../env.js";

/**
 * Cookie de session (SEC-001).
 *
 * httpOnly : inaccessible au JavaScript de la page, donc insensible au XSS.
 * sameSite=lax : suffisant pour une application web servie sur son domaine,
 * tout en laissant passer les retours de redirection depuis un prestataire
 * de paiement. secure : obligatoire en production (validé par env.ts).
 */
export const SESSION_COOKIE_NAME = "uno_session";

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    }),
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    }),
  );
}
