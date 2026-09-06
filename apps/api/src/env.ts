import "dotenv/config";
import { z } from "zod";

/**
 * Configuration par environnement (TECH-001, SEC-006).
 *
 * Aucune valeur sensible n'a de valeur par défaut exploitable en production :
 * le serveur refuse de démarrer si un secret requis manque. Aucun secret
 * n'est jamais renvoyé au client ni écrit dans les journaux.
 */

const booleanFromEnv = z
  .string()
  .transform((value) => value === "true" || value === "1")
  .pipe(z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    /** Chaîne de connexion MySQL/TiDB. */
    DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Certificat CA pour TiDB Cloud (connexion TLS obligatoire). */
    DATABASE_SSL: booleanFromEnv.default(false),

    /** Clé de signature/salage des jetons de session. 32 caractères minimum. */
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET doit faire au moins 32 caractères"),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** Domaine du cookie de session ; vide = domaine courant. */
    COOKIE_DOMAIN: z.string().optional(),
    /** true derrière un reverse proxy TLS (obligatoire en production). */
    COOKIE_SECURE: booleanFromEnv.default(false),

    /** Origines autorisées, séparées par des virgules. */
    CORS_ORIGINS: z.string().default("http://localhost:5173"),

    /** Email du compte administrateur créé au premier démarrage (ADMIN-001). */
    ADMIN_EMAIL: z.string().optional(),
    /** Mot de passe initial de ce compte ; à changer après le premier accès. */
    ADMIN_PASSWORD: z.string().optional(),

    /** Prestataire de paiement. "none" masque les moyens externes dans l'UI. */
    PAYMENT_PROVIDER: z.enum(["none", "stripe"]).default("none"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    /** URL de retour après paiement, côté application web. */
    PAYMENT_RETURN_URL: z.string().default("http://localhost:5173/calendrier"),

    /** Stockage des images. "local" écrit sur disque, "s3" utilise S3/R2. */
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./uploads"),
    STORAGE_PUBLIC_URL: z.string().default("http://localhost:4000/uploads"),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    /** Autorise les routes de seed/test (jamais en production). */
    ENABLE_DEV_TOOLS: booleanFromEnv.default(false),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_PROVIDER === "stripe" && !env.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message: "STRIPE_SECRET_KEY est requis quand PAYMENT_PROVIDER=stripe",
      });
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of [
        "S3_BUCKET",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} est requis quand STORAGE_DRIVER=s3`,
          });
        }
      }
    }
    if (env.NODE_ENV === "production") {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: "custom",
          path: ["COOKIE_SECURE"],
          message: "COOKIE_SECURE doit valoir true en production (SEC-001)",
        });
      }
      if (env.ENABLE_DEV_TOOLS) {
        ctx.addIssue({
          code: "custom",
          path: ["ENABLE_DEV_TOOLS"],
          message:
            "ENABLE_DEV_TOOLS doit rester false en production (CDC §15, seed/test)",
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
    .join("\n");
  // Message volontairement explicite : il ne s'affiche qu'au démarrage du
  // serveur, jamais dans une réponse HTTP.
  throw new Error(
    `Configuration d'environnement invalide.\n${details}\n\nCopiez .env.example vers .env et complétez les valeurs.`,
  );
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
