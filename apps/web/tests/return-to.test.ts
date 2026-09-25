import { describe, expect, it } from "vitest";
import { internalPath } from "../src/lib/return-to.js";

/**
 * Le retour après connexion ne doit mener qu'à un écran de l'application.
 *
 * Une adresse extérieure acceptée ici ferait de la page de connexion une
 * redirection ouverte : un lien piégé enverrait, une fois connecté, sur un
 * site qui imite le nôtre.
 */
describe("retour après connexion", () => {
  it("accepte un chemin de l'application", () => {
    expect(internalPath("/sessions/16")).toBe("/sessions/16");
    expect(internalPath("/")).toBe("/");
  });

  it("refuse une adresse extérieure, même déguisée", () => {
    expect(internalPath("https://exemple.com/sessions/16")).toBeNull();
    expect(internalPath("//exemple.com")).toBeNull();
    expect(internalPath("javascript:alert(1)")).toBeNull();
  });

  it("refuse l'absence de chemin", () => {
    expect(internalPath(null)).toBeNull();
    expect(internalPath(undefined)).toBeNull();
    expect(internalPath("")).toBeNull();
  });
});
