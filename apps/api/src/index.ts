import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { parse as parseCookie } from "cookie";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ALLOWED_IMAGE_MIME_TYPES, AppError, LIMITS, VENUES } from "@uno/shared";
import { closeDatabase } from "./db/client.js";
import { corsOrigins, env } from "./env.js";
import { logger } from "./lib/logger.js";
import { paymentAdapter } from "./payments/index.js";
import { applyWebhookOutcome } from "./services/payments.service.js";
import { ensureDefaultVenues } from "./services/venues.service.js";
import {
  ensureAdminAccount,
  purgeExpiredSessions,
  resolveSession,
} from "./services/auth.service.js";
import { expireStaleProposals } from "./services/proposals.service.js";
import { storeImage } from "./storage/index.js";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/routers/index.js";

const app: express.Express = express();

// Derrière un reverse proxy (Railway, Fly, Nginx), req.ip doit refléter
// l'adresse réelle du client pour que la limitation de débit ait un sens.
app.set("trust proxy", 1);

app.use(
  helmet({
    // L'API ne sert pas de HTML : la CSP est portée par l'hébergeur du front.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      // Les applications natives Capacitor n'envoient pas toujours d'origine.
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Origine non autorisée"));
    },
    credentials: true,
  }),
);

/** Analyse minimale des cookies : seul le cookie de session nous intéresse. */
app.use((req, _res, next) => {
  const header = req.headers.cookie;
  (req as Request & { cookies: Record<string, string> }).cookies = header
    ? parseCookie(header) as Record<string, string>
    : {};
  next();
});

// ---------------------------------------------------------------------------
// Webhook prestataire de paiement — AVANT express.json(), car la vérification
// de signature exige le corps brut, octet pour octet (CAL-010).
// ---------------------------------------------------------------------------

app.post(
  "/webhooks/payments",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      res.status(400).json({ error: "Signature manquante" });
      return;
    }

    const event = paymentAdapter().verifyWebhook(req.body as Buffer, signature);
    if (!event) {
      // Signature invalide ou évènement non pertinent : aucun effet de bord.
      res.status(400).json({ error: "Webhook rejeté" });
      return;
    }

    try {
      const result = await applyWebhookOutcome(event);
      res.json({ received: true, applied: result.applied });
    } catch (error) {
      logger.error({ err: error }, "échec du traitement d'un webhook");
      res.status(500).json({ error: "Erreur de traitement" });
    }
  },
);

app.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// Limitation de débit (NFR, SEC)
// ---------------------------------------------------------------------------

const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessayez dans quelques instants." },
});

/**
 * Limite stricte sur les points d'entrée d'authentification : elle rend
 * l'attaque par force brute impraticable sans gêner un usage normal.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

app.use(globalLimiter);
app.use((req, res, next) => {
  // tRPC regroupe plusieurs procédures dans un même chemin ; il suffit que
  // l'une d'elles soit une procédure d'authentification pour appliquer la
  // limite stricte.
  if (req.path.includes("auth.login") || req.path.includes("auth.signup")) {
    authLimiter(req, res, next);
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Santé et métadonnées
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: Math.round(process.uptime()) });
});

// ---------------------------------------------------------------------------
// Téléversement d'images (SEC-005)
// ---------------------------------------------------------------------------

app.post(
  "/uploads/:kind",
  express.raw({
    type: ALLOWED_IMAGE_MIME_TYPES as unknown as string[],
    limit: LIMITS.uploadMaxBytes,
  }),
  async (req: Request, res: Response) => {
    try {
      const token =
        typeof req.headers.authorization === "string" &&
        req.headers.authorization.startsWith("Bearer ")
          ? req.headers.authorization.slice(7)
          : ((req as Request & { cookies: Record<string, string> }).cookies[
              "uno_session"
            ] ?? null);

      const identity = token ? await resolveSession(token) : null;
      if (!identity) {
        res.status(401).json({ error: "Authentification requise" });
        return;
      }

      // Un préfixe inconnu retombe sur « avatars », le seul dossier qu'un
      // joueur ordinaire est autorisé à alimenter.
      const requested = req.params.kind;
      const kind =
        requested === "products" || requested === "venues" ? requested : "avatars";

      // Produits et salles relèvent du catalogue : réservés à l'administration.
      if (kind !== "avatars" && identity.role !== "admin") {
        res.status(403).json({ error: "Droits insuffisants" });
        return;
      }

      const stored = await storeImage(
        req.body as Buffer,
        String(req.headers["content-type"] ?? "").split(";")[0]?.trim() ?? "",
        kind,
      );
      res.json({ url: stored.url });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.httpStatus).json({ error: error.message });
        return;
      }
      logger.error({ err: error }, "échec du téléversement");
      res.status(500).json({ error: "Le téléversement a échoué." });
    }
  },
);

// En stockage local, les fichiers sont servis directement par l'API.
if (env.STORAGE_DRIVER === "local") {
  app.use(
    "/uploads",
    express.static(env.STORAGE_LOCAL_DIR, {
      maxAge: "1y",
      immutable: true,
      index: false,
      dotfiles: "deny",
    }),
  );
}

// ---------------------------------------------------------------------------
// API tRPC
// ---------------------------------------------------------------------------

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        logger.error({ err: error, path }, "erreur interne tRPC");
      }
    },
  }),
);

app.use((_req, res) => {
  res.status(404).json({ error: "Ressource inconnue" });
});

// Le client ne reçoit jamais de détail technique (SEC-007).
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: error }, "erreur express non gérée");
  res.status(500).json({ error: "Une erreur est survenue." });
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

const HOUSEKEEPING_INTERVAL_MS = 5 * 60_000;

async function start(): Promise<void> {
  await ensureAdminAccount();

  // Sans salle, aucune session ne peut être proposée : une base fraîche
  // serait bloquée dès le premier écran. Les salles historiques sont donc
  // créées au premier démarrage, puis administrées normalement (ADMIN-007).
  const seeded = await ensureDefaultVenues(
    VENUES.map((venue) => ({
      slug: venue.id,
      name: venue.name,
      timezone: venue.timezone,
    })),
  );
  if (seeded.created > 0) {
    logger.info({ created: seeded.created }, "salles initiales créées");
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, payments: env.PAYMENT_PROVIDER },
      "API UNO League démarrée",
    );
  });

  // Entretien périodique : purge des sessions expirées et clôture des
  // propositions dont la date est passée (cas limite §21.1).
  const housekeeping = setInterval(() => {
    void (async () => {
      try {
        const sessions = await purgeExpiredSessions();
        const stale = await expireStaleProposals();
        if (sessions || stale.cancelled || stale.overdue) {
          logger.info({ sessions, ...stale }, "entretien périodique");
        }
      } catch (error) {
        logger.error({ err: error }, "échec de l'entretien périodique");
      }
    })();
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "arrêt en cours");
    clearInterval(housekeeping);
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
    // Filet de sécurité si des connexions restent ouvertes.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error: unknown) => {
  logger.error({ err: error }, "démarrage impossible");
  process.exit(1);
});

export { app, appRouter };
export type { AppRouter } from "./trpc/routers/index.js";
