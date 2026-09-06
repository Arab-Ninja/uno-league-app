import pino from "pino";
import { env, isProduction } from "../env.js";

/**
 * Journalisation structurée (NFR-005) avec rédaction stricte (SEC-007).
 *
 * Les chemins listés dans `redact` ne sont jamais écrits en clair : mots de
 * passe, jetons de session, en-têtes d'autorisation, cookies et données PSP.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "newPassword",
      "currentPassword",
      "passwordHash",
      "token",
      "tokenHash",
      "sessionToken",
      "*.password",
      "*.passwordHash",
      "*.token",
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "stripe",
      "*.stripe",
      "card",
      "*.card",
    ],
    censor: "[rédigé]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino/file",
          options: { destination: 1 },
        },
      }),
});

export type Logger = typeof logger;
