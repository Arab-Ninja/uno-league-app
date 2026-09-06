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
