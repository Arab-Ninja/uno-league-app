import { describe, expect, it } from "vitest";
import { contientGrossierete, masquerGrossieretes } from "./moderation.js";

describe("filtre de grossièretés (MOD-001)", () => {
  it("masque le mot entier, quelle que soit la casse ou l'accent", () => {
    expect(masquerGrossieretes("espèce d'ENCULÉ")).toBe("espèce d'E*****");
    expect(masquerGrossieretes("what the fuck")).toBe("what the f***");
    expect(masquerGrossieretes("klootzak!")).toBe("k*******!");
  });

  it("laisse passer les mots qui en contiennent un sans en être un", () => {
    for (const texte of [
      "Rendez-vous à Scunthorpe",
      "Le contrôle était propre",
      "Concert après le match",
      "Saluons l'arbitre",
    ]) {
      expect(masquerGrossieretes(texte)).toBe(texte);
      expect(contientGrossierete(texte)).toBe(false);
    }
  });

  it("garde la ponctuation et les espaces intacts", () => {
    expect(masquerGrossieretes("  pute ,  salope  ")).toBe(
      "  p*** ,  s*****  ",
    );
  });
});
