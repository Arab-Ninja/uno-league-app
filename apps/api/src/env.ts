import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Chargement du fichier `.env`.
 *
 * `dotenv/config` ne regarde que le répertoire d'exécution. Or les commandes
 * du dépôt (`pnpm db:migrate`, `pnpm dev`) s'exécutent depuis `apps/api` :
 * un `.env` placé à la racine n'était alors pas lu, et l'erreur remontée
 * parlait de configuration invalide sans dire que le fichier n'avait pas été
 * trouvé.
 *
 * On remonte donc l'arborescence depuis ce module jusqu'au fichier
 * `pnpm-workspace.yaml`, qui marque la racine du dépôt. Un `.env` local à
 * `apps/api` reste prioritaire s'il existe, ce qui permet de surcharger la
 * configuration pour ce seul service.
 */
function findRepositoryRoot(): string | null {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

const dotenvCandidates = [
  resolve(process.cwd(), ".env"),
  ...(findRepositoryRoot()
    ? [join(findRepositoryRoot() as string, ".env")]
    : []),
];

/** Les fichiers sont chargés dans l'ordre ; le premier trouvé fait foi. */
export const loadedEnvFiles = dotenvCandidates.filter((path) =>
  existsSync(path),
);
for (const path of loadedEnvFiles) {
  loadDotenv({ path, quiet: true });
}

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

/**
 * Exporté pour les tests : ils exercent les garde-fous en soumettant des
 * configurations entières, plutôt qu'en démarrant un serveur pour chacune.
 * Le serveur, lui, n'utilise que `env` ci-dessous.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    /**
     * Chaîne de connexion MySQL/TiDB.
     * Alternative : renseigner DATABASE_HOST / _PORT / _USER / _PASSWORD /
     * _NAME, ce qui évite d'avoir à encoder les caractères spéciaux du mot de
     * passe dans une URL.
     */
    DATABASE_URL: z.string().optional(),
    DATABASE_HOST: z.string().optional(),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_USER: z.string().optional(),
    DATABASE_PASSWORD: z.string().optional(),
    DATABASE_NAME: z.string().optional(),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Active TLS. Obligatoire pour TiDB Cloud et tout accès public. */
    DATABASE_SSL: booleanFromEnv.default(false),
    /**
     * Chemin optionnel vers un certificat d'autorité. Inutile pour TiDB Cloud
     * et la plupart des hébergeurs : leurs certificats sont émis par une
     * autorité publique, déjà connue de Node. À renseigner uniquement pour
     * une base dont le certificat est signé par une autorité privée.
     */
    DATABASE_CA_PATH: z.string().optional(),

    /** Clé de signature/salage des jetons de session. 32 caractères minimum. */
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET doit faire au moins 32 caractères"),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** Domaine du cookie de session ; vide = domaine courant. */
    COOKIE_DOMAIN: z.string().optional(),
    /** true derrière un reverse proxy TLS (obligatoire en production). */
    COOKIE_SECURE: booleanFromEnv.default(false),
    /**
     * Attribut `SameSite` du cookie de session (SEC-001).
     *
     * `lax` convient tant que l'application web et l'API partagent un site :
     * `mon-domaine.app` et `api.mon-domaine.app` en sont un seul, et le
     * cookie voyage normalement.
     *
     * `none` devient nécessaire dès qu'elles sont sur **deux sites
     * distincts** — deux sous-domaines d'un hébergeur, par exemple, car ces
     * suffixes figurent à la Public Suffix List précisément pour séparer
     * leurs clients. Le navigateur refuse alors de renvoyer un cookie `lax`,
     * et le symptôme est déroutant : la connexion réussit, puis l'écran de
     * connexion revient, sans aucune erreur.
     *
     * La protection contre les requêtes intersites ne repose pas sur cet
     * attribut mais sur la liste blanche d'origines (`CORS_ORIGINS`), qui
     * reste en vigueur dans les deux cas.
     */
    COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).default("lax"),

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

    /**
     * Notifications push web (ANN-004).
     *
     * Les clés VAPID identifient le serveur auprès des services de push des
     * navigateurs. Elles se génèrent une fois — `pnpm push:keys` — et se
     * conservent : les changer invaliderait tous les abonnements existants.
     * Absentes, le push est simplement désactivé ; l'application continue de
     * fonctionner avec les notifications internes.
     */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** Contact exigé par la spécification : une adresse mailto: ou une URL. */
    /*
     * Adresse de contact transmise aux services de push.
     *
     * Elle a longtemps pointé vers `unoleague.app`, un domaine que la ligue ne
     * possède pas. Ce n'est pas décoratif : Mozilla et Google s'en servent
     * pour joindre l'expéditeur quand ses envois posent problème, et une
     * adresse morte les prive du seul moyen de prévenir avant de bloquer.
     */
    VAPID_SUBJECT: z.string().default("mailto:contact@unoleague.be"),

    /**
     * Firebase Cloud Messaging, pour les applications empaquetées (ANN-005).
     *
     * Le Web Push ci-dessus n'existe que dans un navigateur : ni la WebView
     * Android ni WKWebView n'exposent l'API Push. Une application installée
     * depuis un store passe donc par Firebase, et par lui seul.
     *
     * Les trois valeurs viennent du fichier JSON d'un **compte de service**
     * Firebase (Paramètres du projet → Comptes de service → Générer une clé).
     * Absentes, le push natif est simplement désactivé : le Web Push continue
     * de servir les navigateurs, et rien ne casse.
     */
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    /**
     * Clé privée PEM du compte de service.
     *
     * Les consoles d'hébergement n'acceptent pas les sauts de ligne dans une
     * variable : la valeur arrive avec des `\n` littéraux, que
     * `fcmCredentials` retraduit. Coller la clé telle quelle est donc correct.
     */
    FCM_PRIVATE_KEY: z.string().optional(),

    /**
     * Envoi de courrier (MAIL-001).
     *
     * Quatre valeurs, prises chez l'hébergeur de la boîte : serveur, port,
     * identifiant et mot de passe. `MAIL_FROM` est l'expéditeur affiché ; il
     * doit appartenir au domaine authentifié, sinon le message part en
     * indésirable ou se fait refuser.
     *
     * Absentes, l'envoi est désactivé et rien ne casse — sauf une chose, qui
     * mérite d'être dite : **sans courrier, un mot de passe oublié est
     * définitif**. Il n'existe aucun autre chemin de réinitialisation, pas
     * même par l'administration.
     */
    MAIL_HOST: z.string().optional(),
    /**
     * 587 avec STARTTLS est le réglage courant ; 465 chiffre dès la
     * connexion. Le choix est déduit du port (voir `mailer.ts`) plutôt que
     * demandé : une variable de plus serait une variable de plus à se
     * tromper.
     */
    MAIL_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    /** Ex. « UNO League <contact@unoleague.be> ». */
    MAIL_FROM: z.string().optional(),
    /**
     * Racine des liens contenus dans les courriers, sans barre oblique finale.
     *
     * Un lien de réinitialisation doit mener quelque part, et le serveur ne
     * peut pas le deviner : il ne connaît ni le domaine public, ni le schéma.
     * Le déduire de l'en-tête `Host` de la requête serait pire — un en-tête
     * fourni par le client décidant de l'adresse d'un lien de sécurité est
     * une faille connue sous le nom d'empoisonnement d'en-tête Host.
     */
    PUBLIC_WEB_URL: z.string().optional(),

    /** Stockage des images. "local" écrit sur disque, "s3" utilise S3/R2. */
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./uploads"),
    /**
     * Préfixe public des fichiers envoyés (IMG-001).
     *
     * Relatif par défaut, et c'est le point important : une adresse absolue
     * inscrit l'hôte du serveur dans la base, et cette adresse dépend de qui
     * regarde — `localhost` depuis le PC, l'adresse du Wi-Fi depuis le
     * téléphone. En production, où l'API a un domaine public stable, on
     * renseigne l'adresse complète : `https://api.exemple.app/uploads`.
     */
    STORAGE_PUBLIC_URL: z.string().default("/uploads"),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    /** Autorise les routes de seed/test (jamais en production). */
    ENABLE_DEV_TOOLS: booleanFromEnv.default(false),

    /**
     * Ouvre le mode SQUAD (SQUAD-001).
     *
     * Le mode se construit par phases, et chacune est poussée sur la branche
     * principale avant que l'ensemble soit prêt. Le drapeau garde donc une
     * mise en production **possible à tout moment** : le cœur de
     * l'application peut partir chez de vrais joueurs sans attendre que SQUAD
     * soit terminé, et sans qu'un mode à demi construit s'affiche.
     *
     * Il ne fait pas que masquer l'interface : **les routes le vérifient
     * aussi**. Une fonctionnalité seulement cachée reste appelable par qui
     * regarde le réseau.
     */
    FEATURE_SQUAD: booleanFromEnv.default(false),
    /**
     * Le mode Grand Foot (MODE-003).
     *
     * Même mécanique que pour les clubs : fermé, le mode disparaît des écrans
     * **et le serveur refuse ses propositions**. Une fonctionnalité seulement
     * cachée reste appelable par qui regarde le réseau.
     */
    FEATURE_BIGFOOT: booleanFromEnv.default(false),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((env, ctx) => {
    const hasComponents =
      Boolean(env.DATABASE_HOST) &&
      Boolean(env.DATABASE_USER) &&
      Boolean(env.DATABASE_NAME);

    if (!env.DATABASE_URL && !hasComponents) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          "Renseignez DATABASE_URL, ou bien DATABASE_HOST, DATABASE_USER, " +
          "DATABASE_PASSWORD et DATABASE_NAME.",
      });
    }

    if (env.PAYMENT_PROVIDER === "stripe" && !env.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message: "STRIPE_SECRET_KEY est requis quand PAYMENT_PROVIDER=stripe",
      });
    }

    /*
     * Le secret du webhook est aussi obligatoire que la clé secrète, et pour
     * une raison plus grave (PAY-004).
     *
     * Sans lui, rien ne semble cassé : l'API démarre, le tunnel de paiement
     * s'ouvre, la carte du joueur est **débitée** chez Stripe. Mais la
     * confirmation revient signée, et `verifyWebhook` n'a pas de quoi
     * vérifier cette signature : il la rejette. La place n'est jamais
     * attribuée. Le joueur a payé et n'a rien, et la seule trace est une
     * ligne de journal que personne ne lit.
     *
     * C'est le pire mode de panne qu'on puisse avoir — silencieux, du côté
     * de l'argent, et découvert par le joueur plutôt que par nous. Refuser de
     * démarrer est bruyant, immédiat, et se répare en collant une variable.
     *
     * Accepter le secret manquant « pour ne pas bloquer le déploiement »
     * reviendrait à préférer un service qui encaisse sans livrer à un service
     * éteint. Un service éteint ne prend l'argent de personne.
     */
    if (env.PAYMENT_PROVIDER === "stripe" && !env.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_WEBHOOK_SECRET"],
        message:
          "STRIPE_WEBHOOK_SECRET est requis quand PAYMENT_PROVIDER=stripe : " +
          "sans lui, les cartes sont débitées et les places jamais attribuées.",
      });
    }
    /*
     * Firebase se configure en trois valeurs, et n'en tolère pas deux.
     *
     * Une configuration partielle est le pire cas : `fcmEnabled()` répond
     * non, le serveur démarre, et les applications mobiles ne reçoivent
     * jamais rien — sans erreur, parce qu'un push raté ne remonte jamais
     * jusqu'à l'action qu'il annonce. On l'arrête donc ici, où le message se
     * lit.
     */
    const fcmKeys = [
      "FCM_PROJECT_ID",
      "FCM_CLIENT_EMAIL",
      "FCM_PRIVATE_KEY",
    ] as const;
    const fcmProvided = fcmKeys.filter((key) => Boolean(env[key]));
    if (fcmProvided.length > 0 && fcmProvided.length < fcmKeys.length) {
      for (const key of fcmKeys) {
        if (env[key]) continue;
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            `${key} manque : les trois valeurs Firebase vont ensemble, sinon ` +
            "les applications mobiles ne reçoivent rien, en silence.",
        });
      }
    }

    /*
     * Le courrier se configure en quatre valeurs, et n'en tolère pas trois.
     *
     * Même raisonnement que pour Firebase, avec une conséquence plus grave :
     * une configuration partielle laisse démarrer un serveur où la demande de
     * réinitialisation répond « si un compte existe, un message est parti » —
     * la réponse volontairement muette qui évite d'énumérer les comptes — sans
     * qu'aucun message ne parte jamais. Le joueur attend un courrier qui
     * n'existe pas, et rien dans les journaux ne ressemble à une erreur.
     */
    const mailKeys = [
      "MAIL_HOST",
      "MAIL_USER",
      "MAIL_PASSWORD",
      "MAIL_FROM",
    ] as const;
    const mailProvided = mailKeys.filter((key) => Boolean(env[key]));
    if (mailProvided.length > 0 && mailProvided.length < mailKeys.length) {
      for (const key of mailKeys) {
        if (env[key]) continue;
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            `${key} manque : les quatre valeurs d'envoi vont ensemble, sinon ` +
            "une demande de réinitialisation répond « message envoyé » sans " +
            "que rien ne parte.",
        });
      }
    }

    /*
     * Un courrier sans adresse publique ne sert à rien : le lien de
     * réinitialisation qu'il porte ne mènerait nulle part.
     */
    if (mailProvided.length === mailKeys.length && !env.PUBLIC_WEB_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_WEB_URL"],
        message:
          "PUBLIC_WEB_URL est requis dès que l'envoi de courrier est " +
          "configuré : sans lui, le lien de réinitialisation ne mène nulle part.",
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

      /**
       * Le préfixe relatif convient au stockage local, que l'API sert
       * elle-même. Sur S3, le fichier vit ailleurs : une adresse relative
       * pointerait vers une API qui n'a pas ce fichier, et les images
       * seraient introuvables sans que rien ne le dise (IMG-001).
       */
      if (env.STORAGE_PUBLIC_URL.startsWith("/")) {
        ctx.addIssue({
          code: "custom",
          path: ["STORAGE_PUBLIC_URL"],
          message:
            "STORAGE_PUBLIC_URL doit être l'adresse complète du bucket ou du " +
            "CDN quand STORAGE_DRIVER=s3",
        });
      }
    }
    if (env.NODE_ENV === "production") {
      if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE) {
        /*
         * Un navigateur rejette silencieusement `SameSite=None` sans
         * `Secure`. Le laisser passer produirait exactement la panne que
         * cette option sert à réparer, en plus difficile à diagnostiquer.
         */
        ctx.addIssue({
          code: "custom",
          path: ["COOKIE_SAMESITE"],
          message:
            "COOKIE_SAMESITE=none exige COOKIE_SECURE=true : sans cela, le " +
            "navigateur ignore le cookie.",
        });
      }

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

/**
 * Analyse les fichiers `.env` lus pour expliquer une variable manquante.
 *
 * Deux pièges classiques, l'un et l'autre silencieux :
 *
 *  - la ligne existe mais reste commentée (`# DATABASE_HOST=...`), parce que
 *    le modèle `.env.example` la fournit commentée ;
 *  - le fichier a été enregistré en UTF-16 par l'éditeur de Windows, auquel
 *    cas aucune variable n'est lue du tout.
 *
 * Sans ce diagnostic, l'erreur affichée dit seulement qu'une valeur manque,
 * alors qu'elle est bien écrite dans le fichier, sous les yeux de la personne
 * qui la cherche.
 */
function explainEnvFiles(missingKeys: readonly string[]): string[] {
  const notes: string[] = [];

  for (const file of loadedEnvFiles) {
    let content: string;
    try {
      const bytes = readFileSync(file);
      // UTF-16 : un octet nul sur deux dès le début du fichier.
      if (bytes.length > 1 && bytes.includes(0)) {
        notes.push(
          `${file} semble enregistré en UTF-16. Aucune variable ne peut en être lue.`,
          "  Réenregistrez-le en UTF-8 (dans le Bloc-notes : Fichier > Enregistrer sous > Encodage : UTF-8).",
        );
        continue;
      }
      content = bytes.toString("utf8");
    } catch {
      continue;
    }

    const commentedOut = content
      .split(/\r?\n/)
      .map((line) => /^\s*#\s*([A-Z][A-Z0-9_]*)\s*=\s*(\S)/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
      .filter((key) => missingKeys.includes(key));

    if (commentedOut.length > 0) {
      notes.push(
        `Dans ${file}, ces lignes sont renseignées mais COMMENTÉES :`,
        ...commentedOut.map((key) => `  # ${key}=...`),
        "  Retirez le caractère # en début de ligne pour qu'elles soient prises en compte.",
      );
    }
  }

  return notes;
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map(
      (issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`,
    )
    .join("\n");

  // Savoir si un fichier a été lu, et lequel, évite de chercher au mauvais
  // endroit : c'est la première question qu'on se pose devant cette erreur.
  const source =
    loadedEnvFiles.length > 0
      ? `Fichier(s) lu(s) : ${loadedEnvFiles.join(", ")}`
      : `Aucun fichier .env trouvé. Emplacements examinés :\n` +
        dotenvCandidates.map((path) => `  - ${path}`).join("\n") +
        `\n\nCréez le fichier .env à la racine du dépôt :\n` +
        `  cp .env.example .env`;

  // Variables de connexion effectivement lues : leur absence est la cause la
  // plus fréquente, et la voir listée évite de relire le fichier à l'aveugle.
  const connectionKeys = [
    "DATABASE_URL",
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_NAME",
  ] as const;

  const seen = connectionKeys
    .map((key) => {
      const value = process.env[key];
      const state = !value
        ? "absente"
        : key === "DATABASE_PASSWORD"
          ? "définie"
          : `« ${value} »`;
      return `  ${key.padEnd(18)} ${state}`;
    })
    .join("\n");

  const missingKeys = connectionKeys.filter((key) => !process.env[key]);
  const notes = explainEnvFiles(missingKeys);

  // Message volontairement explicite : il ne s'affiche qu'au démarrage du
  // serveur, jamais dans une réponse HTTP.
  throw new Error(
    [
      "Configuration d'environnement invalide.",
      details,
      "",
      source,
      "",
      "Variables de connexion lues :",
      seen,
      ...(notes.length > 0 ? ["", ...notes] : []),
    ].join("\n"),
  );
}

const raw = parsed.data;

/**
 * Chaîne de connexion effective.
 *
 * Lorsque les composants sont fournis séparément, l'URL est assemblée ici
 * avec `encodeURIComponent` sur l'utilisateur et le mot de passe. C'est la
 * cause d'échec la plus fréquente à la mise en production : les mots de passe
 * générés par TiDB Cloud contiennent régulièrement des caractères
 * (`@`, `/`, `:`, `?`, `#`, `%`) qui coupent une URL écrite à la main, et
 * l'erreur remontée est alors un « accès refusé » trompeur.
 */
function resolveDatabaseUrl(): string {
  if (raw.DATABASE_URL) return raw.DATABASE_URL;

  const user = encodeURIComponent(raw.DATABASE_USER ?? "");
  const password = encodeURIComponent(raw.DATABASE_PASSWORD ?? "");
  const credentials = password ? `${user}:${password}` : user;

  return `mysql://${credentials}@${raw.DATABASE_HOST}:${raw.DATABASE_PORT}/${raw.DATABASE_NAME}`;
}

export const env = { ...raw, DATABASE_URL: resolveDatabaseUrl() };

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
