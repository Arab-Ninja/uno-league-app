import { describe, expect, it } from "vitest";
import { envSchema } from "../src/env.js";

/**
 * Garde-fous de configuration (TECH-001, PAY-004).
 *
 * Ces tests n'ont pas besoin de base : ils soumettent des configurations
 * entières au schéma et vérifient ce qu'il accepte. C'est précisément ce qui
 * les rend utiles — chaque cas ici représente un déploiement qui aurait pu
 * partir en production, et le schéma est le seul endroit où on peut encore
 * l'arrêter.
 */

/** Le minimum pour qu'une configuration soit valide : tout le reste a un défaut. */
const BASE = {
  DATABASE_URL: "mysql://uno:secret@127.0.0.1:3306/uno_league",
  SESSION_SECRET: "x".repeat(32),
} as const;

/** Les chemins des variables mises en cause par un refus. */
function rejectedPaths(input: Record<string, unknown>): string[] {
  const result = envSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => String(issue.path[0]));
}

describe("configuration des paiements (PAY-004)", () => {
  it("PAY-004 — Stripe sans secret de webhook est refusé", () => {
    /*
     * Le cas qui motive tout ce fichier. Cette configuration démarrait, et
     * elle encaissait : le tunnel de paiement s'ouvre, la carte est débitée,
     * puis la confirmation signée de Stripe est rejetée faute de pouvoir
     * vérifier sa signature. Le joueur paie et n'a pas sa place.
     */
    expect(
      rejectedPaths({
        ...BASE,
        PAYMENT_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_live_exemple",
      }),
    ).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("PAY-004 — le message dit ce qu'on risque, pas seulement ce qui manque", () => {
    const result = envSchema.safeParse({
      ...BASE,
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_live_exemple",
    });

    expect(result.success).toBe(false);
    const message = result.success
      ? ""
      : result.error.issues
          .filter((issue) => issue.path[0] === "STRIPE_WEBHOOK_SECRET")
          .map((issue) => issue.message)
          .join(" ");

    // Le texte apparaît dans le journal de déploiement, souvent lu par
    // quelqu'un qui n'a pas le contexte. « Variable manquante » se corrige en
    // la retirant du code ; « les cartes sont débitées » ne se corrige que
    // d'une seule façon.
    expect(message).toMatch(/débitées/i);
  });

  it("PAY-004 — Stripe complet est accepté", () => {
    const result = envSchema.safeParse({
      ...BASE,
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_live_exemple",
      STRIPE_WEBHOOK_SECRET: "whsec_exemple",
    });

    expect(result.success).toBe(true);
  });

  it("PAY-004 — la clé secrète reste exigée, elle aussi", () => {
    expect(
      rejectedPaths({
        ...BASE,
        PAYMENT_PROVIDER: "stripe",
        STRIPE_WEBHOOK_SECRET: "whsec_exemple",
      }),
    ).toContain("STRIPE_SECRET_KEY");
  });

  it("PAY-004 — sans prestataire, aucune clé n'est réclamée", () => {
    /*
     * La garde ne doit pas déborder : une ligue qui n'encaisse qu'en UNO n'a
     * rien à configurer chez Stripe, et exiger ses clés lui interdirait de
     * démarrer pour un service qu'elle n'utilise pas.
     */
    const result = envSchema.safeParse({ ...BASE, PAYMENT_PROVIDER: "none" });
    expect(result.success).toBe(true);

    // Et c'est bien le défaut : on ne démarre pas en encaissant par accident.
    const implicite = envSchema.safeParse(BASE);
    expect(implicite.success).toBe(true);
    expect(implicite.success && implicite.data.PAYMENT_PROVIDER).toBe("none");
  });
});

describe("garde-fous de production (SEC-001)", () => {
  /** Une configuration de production, valide, dont chaque test écarte un point. */
  const PROD = {
    ...BASE,
    NODE_ENV: "production",
    COOKIE_SECURE: "true",
    ENABLE_DEV_TOOLS: "false",
  } as const;

  it("SEC-001 — la production exige un cookie sécurisé", () => {
    expect(rejectedPaths({ ...PROD, COOKIE_SECURE: "false" })).toContain(
      "COOKIE_SECURE",
    );
  });

  it("SEC-001 — les outils de développement sont interdits en production", () => {
    // C'est la variable qui ouvre `db:reset` et le jeu d'essai : laissée à
    // `true` sur un serveur en ligne, elle met la base à la portée d'une
    // commande.
    expect(rejectedPaths({ ...PROD, ENABLE_DEV_TOOLS: "true" })).toContain(
      "ENABLE_DEV_TOOLS",
    );
  });

  it("SEC-001 — `SameSite=none` sans cookie sécurisé est refusé en production", () => {
    // Le navigateur ignore purement et simplement un tel cookie : la
    // connexion réussirait puis l'écran de connexion reviendrait, sans
    // erreur nulle part.
    expect(
      rejectedPaths({
        ...PROD,
        COOKIE_SAMESITE: "none",
        COOKIE_SECURE: "false",
      }),
    ).toContain("COOKIE_SAMESITE");

    /*
     * Hors production, la même combinaison passe, et c'est voulu : en
     * développement l'application est servie en clair sur `localhost`, où
     * l'attribut `Secure` empêcherait le cookie d'être posé du tout. Le
     * garde-fou vise le déploiement, pas la machine du développeur.
     */
    expect(
      rejectedPaths({
        ...BASE,
        COOKIE_SAMESITE: "none",
        COOKIE_SECURE: "false",
      }),
    ).toEqual([]);
  });

  it("SEC-001 — une production correctement configurée passe", () => {
    expect(envSchema.safeParse(PROD).success).toBe(true);
  });
});

describe("connexion à la base (TECH-001)", () => {
  it("TECH-001 — ni URL ni composants : le démarrage est refusé", () => {
    expect(rejectedPaths({ SESSION_SECRET: "x".repeat(32) })).toContain(
      "DATABASE_URL",
    );
  });

  it("TECH-001 — les composants séparés suffisent", () => {
    // Ils évitent d'avoir à encoder les caractères spéciaux d'un mot de passe
    // dans une URL — piège classique d'un premier déploiement.
    const result = envSchema.safeParse({
      SESSION_SECRET: "x".repeat(32),
      DATABASE_HOST: "127.0.0.1",
      DATABASE_USER: "uno",
      DATABASE_PASSWORD: "mot@de:passe",
      DATABASE_NAME: "uno_league",
    });
    expect(result.success).toBe(true);
  });

  it("TECH-001 — un secret de session trop court est refusé", () => {
    expect(rejectedPaths({ ...BASE, SESSION_SECRET: "trop-court" })).toContain(
      "SESSION_SECRET",
    );
  });
});
