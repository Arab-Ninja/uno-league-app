import { describe, expect, it } from "vitest";
import { describeCause, isSchemaDriftError } from "../src/lib/errors.js";

/**
 * La cause technique n'est transmise qu'en développement, mais elle ne doit
 * en aucun cas véhiculer de secret : les erreurs de Drizzle contiennent la
 * requête ET ses paramètres liés, hash de mot de passe compris.
 */
describe("cause technique d'une erreur interne", () => {
  /** Reproduit la forme réelle : Drizzle enveloppe l'erreur du pilote. */
  function drizzleError(sqlMessage: string, code: string, errno: number) {
    const driver = Object.assign(new Error("Failed query"), {
      code,
      errno,
      sqlMessage,
      sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    });
    const wrapper = new Error(
      "Failed query: insert into `users` ...\nparams: joueur@test.local," +
        "scrypt$32768$8$3$SEL/AAAA==$HASHSECRETQUINEDOITPASFUITER==",
    );
    (wrapper as { cause?: unknown }).cause = driver;
    return wrapper;
  }

  it("remonte le message du pilote, pas la requête", () => {
    const cause = describeCause(
      drizzleError("Unknown column 'players.position' in 'field list'", "ER_BAD_FIELD_ERROR", 1054),
    );

    expect(cause).toContain("ER_BAD_FIELD_ERROR");
    expect(cause).toContain("Unknown column 'players.position'");
  });

  it("ne laisse jamais passer les paramètres liés ni un hash", () => {
    const cause = describeCause(
      drizzleError("Duplicate entry for key 'users.users_email_unique'", "ER_DUP_ENTRY", 1062),
    );

    expect(cause).not.toContain("scrypt");
    expect(cause).not.toContain("HASHSECRETQUINEDOITPASFUITER");
    expect(cause).not.toContain("params:");
    expect(cause).not.toContain("INSERT INTO");
  });

  it("borne la longueur du message", () => {
    const cause = describeCause(drizzleError("x".repeat(5000), "ER_UNKNOWN", 9999));
    expect((cause ?? "").length).toBeLessThan(260);
  });

  it("reconnaît un schéma en retard sur le code", () => {
    expect(
      isSchemaDriftError(drizzleError("Unknown column 'a'", "ER_BAD_FIELD_ERROR", 1054)),
    ).toBe(true);
    expect(
      isSchemaDriftError(drizzleError("Table 'x' doesn't exist", "ER_NO_SUCH_TABLE", 1146)),
    ).toBe(true);
    expect(
      isSchemaDriftError(drizzleError("Duplicate entry", "ER_DUP_ENTRY", 1062)),
    ).toBe(false);
  });
});
