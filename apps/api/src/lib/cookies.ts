import { serialize } from "cookie";
import type { Response } from "express";
import { env } from "../env.js";

/**
 * Cookie de session (SEC-001).
 *
 * httpOnly : inaccessible au JavaScript de la page, donc insensible au XSS.
 * secure : obligatoire en production (validé par env.ts).
 *
 * `sameSite` vient de la configuration (`COOKIE_SAMESITE`, `lax` par défaut).
 * `lax` suffit tant que l'application web et l'API partagent un site, et
 * laisse passer les retours de redirection d'un prestataire de paiement. Sur
 * deux sites distincts — deux sous-domaines d'un hébergeur, par exemple — il
 * faut `none`, sinon le navigateur ne renvoie jamais le cookie et l'écran de
 * connexion revient sans erreur.
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
      sameSite: env.COOKIE_SAMESITE,
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
      sameSite: env.COOKIE_SAMESITE,
      path: "/",
      maxAge: 0,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    }),
  );
}
