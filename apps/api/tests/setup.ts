/**
 * Charge l'environnement de test AVANT tout import applicatif : `env.ts`
 * valide la configuration au chargement du module, donc les variables doivent
 * être posées en amont.
 */
process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ??
  "mysql://uno:unolocal@127.0.0.1:3306/uno_league_test";
process.env["SESSION_SECRET"] =
  "secret-de-test-uniquement-0123456789abcdefghij";
process.env["LOG_LEVEL"] = "silent";
process.env["ENABLE_DEV_TOOLS"] = "true";
process.env["PAYMENT_PROVIDER"] = "none";
process.env["ADMIN_EMAIL"] = "";
process.env["ADMIN_PASSWORD"] = "";

/**
 * Le mode SQUAD est ouvert en test : c'est ici qu'on vérifie ses règles.
 *
 * La fermeture par le drapeau a son propre test, qui repose la variable le
 * temps de son cas — sans quoi il faudrait deux suites pour une seule
 * différence de configuration.
 */
process.env["FEATURE_SQUAD"] = "true";
// Même raison pour le Grand Foot : ses règles se vérifient ouvert.
process.env["FEATURE_BIGFOOT"] = "true";

/**
 * Racine publique des liens contenus dans les courriers (AUTH-009, MAIL-001).
 *
 * Posée ici et non dans un fichier de test : `env.ts` fige la configuration à
 * son chargement, qui a lieu au premier import applicatif — donc avant qu'un
 * `beforeAll` puisse s'exécuter. La variable est sans effet tant que l'envoi
 * n'est pas configuré, ce qui est le cas par défaut.
 */
process.env["PUBLIC_WEB_URL"] = "https://unoleague.test";
