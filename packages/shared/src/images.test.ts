import { describe, expect, it } from "vitest";
import { publicImageSrc } from "./images.js";

/**
 * Adresse d'affichage des images (IMG-001).
 *
 * Ces cas viennent tous d'un essai réel : une photo envoyée depuis le PC
 * n'apparaissait pas sur le téléphone, et celle envoyée depuis le téléphone
 * n'apparaissait pas sur le PC. La règle testée ici est ce qui remplace
 * l'adresse inscrite en base.
 */
describe("adresse d'affichage d'une image (IMG-001)", () => {
  it("IMG-001 — une adresse locale est ramenée à son chemin", () => {
    expect(
      publicImageSrc("http://localhost:4000/uploads/avatars/a.webp"),
    ).toBe("/uploads/avatars/a.webp");
  });

  it("IMG-001 — une adresse de réseau privé aussi", () => {
    for (const host of [
      "192.168.1.42:5173",
      "10.0.0.7:4000",
      "172.16.3.1",
      "portable.local:5173",
    ]) {
      expect(publicImageSrc(`https://${host}/uploads/products/b.png`)).toBe(
        "/uploads/products/b.png",
      );
    }
  });

  it("IMG-001 — une image extérieure garde son adresse", () => {
    const cdn = "https://cdn.exemple.com/uploads/products/b.png";
    expect(publicImageSrc(cdn)).toBe(cdn);

    const bucket = "https://ligue.s3.eu-west-1.amazonaws.com/avatars/c.webp";
    expect(publicImageSrc(bucket)).toBe(bucket);
  });

  it("IMG-001 — un chemin reçoit l'adresse de l'API quand elle est ailleurs", () => {
    expect(
      publicImageSrc("/uploads/avatars/a.webp", "https://api.unoleague.app"),
    ).toBe("https://api.unoleague.app/uploads/avatars/a.webp");

    // Barre finale en trop : elle ne doit pas se doubler.
    expect(
      publicImageSrc("/uploads/avatars/a.webp", "https://api.unoleague.app/"),
    ).toBe("https://api.unoleague.app/uploads/avatars/a.webp");
  });

  it("IMG-001 — une ancienne ligne locale suit la même API", () => {
    expect(
      publicImageSrc(
        "http://localhost:4000/uploads/avatars/a.webp",
        "https://api.unoleague.app",
      ),
    ).toBe("https://api.unoleague.app/uploads/avatars/a.webp");
  });

  it("IMG-001 — rien à afficher reste rien", () => {
    expect(publicImageSrc(null)).toBeUndefined();
    expect(publicImageSrc(undefined)).toBeUndefined();
    expect(publicImageSrc("")).toBeUndefined();
  });

  it("IMG-001 — une valeur illisible n'est pas inventée", () => {
    expect(publicImageSrc("pas une adresse")).toBe("pas une adresse");
    expect(publicImageSrc("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});
