import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, setSessionCookie } from "../src/lib/cookies.js";
import { env } from "../src/env.js";

/**
 * Cookie de session : attributs réellement émis (SEC-001).
 *
 * Ce test existe à cause d'une panne de mise en ligne. L'application web et
 * l'API se sont retrouvées sur deux sous-domaines du même hébergeur, que le
 * navigateur traite comme **deux sites distincts** — ces suffixes figurent à
 * la Public Suffix List précisément pour séparer leurs clients. Un cookie
 * `SameSite=Lax` n'y est jamais renvoyé.
 *
 * Le symptôme était muet : la connexion réussissait, aucune erreur ne
 * s'affichait, et l'écran de connexion revenait. Rien dans les journaux, rien
 * dans la console. Une heure pour comprendre qu'il manquait un attribut.
 */

/** Réponse Express réduite à ce que la fonction utilise. */
function fakeResponse() {
  const headers = new Map<string, string>();
  return {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    cookie: () => headers.get("set-cookie") ?? "",
  };
}

describe("cookie de session", () => {
  it("émet les attributs de sécurité attendus", () => {
    const res = fakeResponse();
    setSessionCookie(
      res as never,
      "jeton-de-test",
      new Date(Date.now() + 3_600_000),
    );

    const cookie = res.cookie();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=jeton-de-test`);
    // httpOnly : hors de portée du JavaScript de la page, donc du XSS.
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it("porte le SameSite de la configuration, et non une valeur figée", () => {
    /*
     * Le cœur du correctif. La valeur était écrite en dur à `lax`, ce qui
     * condamnait tout déploiement où l'API et le site ne partagent pas un
     * site — sans aucun message pour le dire.
     */
    const res = fakeResponse();
    setSessionCookie(res as never, "jeton", new Date(Date.now() + 3_600_000));

    expect(res.cookie().toLowerCase()).toContain(
      `samesite=${env.COOKIE_SAMESITE}`,
    );
  });

  it("n'accepte que trois valeurs de SameSite", () => {
    // Une faute de frappe (« None », « no ») ne doit pas se traduire par un
    // silence : le serveur refuse de démarrer.
    expect(["lax", "none", "strict"]).toContain(env.COOKIE_SAMESITE);
  });
});
