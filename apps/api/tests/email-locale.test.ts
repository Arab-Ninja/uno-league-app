import { describe, expect, it } from "vitest";
import { passwordResetMail, welcomeMail } from "../src/email/templates.js";

/**
 * Les courriels suivent la langue du compte (I18N-001).
 *
 * C'est le seul endroit où le choix de ranger la langue sur le compte plutôt
 * que sur l'appareil se démontre : un courriel part du serveur, longtemps
 * après le geste, sans téléphone en face pour dire quelle langue lire.
 */
describe("langue des courriels (I18N-001)", () => {
  const base = {
    to: "joueur@exemple.be",
    displayName: "Nora Neuve",
    url: "https://unoleague.be/",
  };

  it("I18N-001 — la bienvenue part dans la langue du compte", () => {
    expect(welcomeMail({ ...base, locale: "fr" }).subject).toBe(
      "Bienvenue dans la ligue",
    );
    expect(welcomeMail({ ...base, locale: "en" }).subject).toBe(
      "Welcome to the league",
    );
    expect(welcomeMail({ ...base, locale: "nl" }).subject).toBe(
      "Welkom bij de competitie",
    );
  });

  it("I18N-001 — la réinitialisation aussi, jeton compris", () => {
    const nl = passwordResetMail({
      ...base,
      validityMinutes: 30,
      locale: "nl",
    });
    expect(nl.subject).toBe("Je UNO League-wachtwoord opnieuw instellen");
    // Le jeton {minutes} est remplacé, et non laissé tel quel.
    expect(nl.text).toContain("30");
    expect(nl.text).not.toContain("{minutes}");
    expect(nl.html).not.toContain("{minutes}");
  });

  it("I18N-001 — sans langue connue, le français sert de refuge", () => {
    expect(welcomeMail(base).subject).toBe("Bienvenue dans la ligue");
  });

  it("I18N-001 — le nom du joueur est échappé dans toutes les langues", () => {
    // Un nom d'affichage est une chaîne que son propriétaire écrit, et un
    // client de messagerie qui rend du HTML rend aussi celui-là (SEC-007).
    const mechant = { ...base, displayName: "<script>alert(1)</script>" };
    for (const locale of ["fr", "en", "nl"] as const) {
      const mail = welcomeMail({ ...mechant, locale });
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain("&lt;script&gt;");
    }
  });

  it("I18N-001 — chaque message part en texte et en HTML", () => {
    // Un message qui n'a que du HTML est un signal de pourriel reconnu par la
    // plupart des filtres, et les lecteurs d'écran lisent le texte.
    for (const locale of ["fr", "en", "nl"] as const) {
      const mail = welcomeMail({ ...base, locale });
      expect(mail.text.length).toBeGreaterThan(80);
      expect(mail.html.length).toBeGreaterThan(200);
    }
  });
});
