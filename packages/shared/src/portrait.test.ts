import { describe, expect, it } from "vitest";
import {
  PORTRAIT_RULES,
  inspectPortrait,
  isPortraitAcceptable,
  keepsSubject,
  type PortraitMetrics,
} from "./portrait.js";

/**
 * Contrôle d'une photo de profil (PHOTO-001).
 *
 * Ces tests fixent la frontière entre ce qui refuse une photo et ce qui se
 * contente de la commenter. C'est la partie de la fonctionnalité qui décide
 * pour l'utilisateur : elle doit être vérifiable sans caméra ni modèle.
 */

/** Une photo irréprochable, dont chaque test s'écarte sur un seul point. */
function goodPhoto(overrides: Partial<PortraitMetrics> = {}): PortraitMetrics {
  return {
    faces: 1,
    faceHeightRatio: 0.55,
    offsetX: 0.01,
    offsetY: 0.02,
    faceMargin: 0.2,
    yawDeg: 2,
    pitchDeg: -3,
    rollDeg: 1,
    eyeOpenness: 0.8,
    sharpness: 0.3,
    brightness: 0.55,
    ...overrides,
  };
}

describe("contrôle d'une photo d'identité (PHOTO-001)", () => {
  it("PHOTO-001 — une photo de face, nette et cadrée, ne déclenche rien", () => {
    expect(inspectPortrait(goodPhoto())).toEqual([]);
    expect(isPortraitAcceptable([])).toBe(true);
  });

  it("PHOTO-001 — sans visage, un seul reproche : il n'y a rien à mesurer", () => {
    const issues = inspectPortrait(goodPhoto({ faces: 0, sharpness: 0, brightness: 0 }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("no_face");
    expect(isPortraitAcceptable(issues)).toBe(false);
  });

  it("PHOTO-001 — deux visages : la photo doit ne montrer que soi", () => {
    const issues = inspectPortrait(goodPhoto({ faces: 2 }));

    expect(issues.map((found) => found.code)).toEqual(["several_faces"]);
    expect(isPortraitAcceptable(issues)).toBe(false);
  });

  it("PHOTO-001 — une tête franchement tournée est refusée, un léger angle non", () => {
    const turned = inspectPortrait(goodPhoto({ yawDeg: 35 }));
    expect(turned.some((found) => found.code === "turned" && found.severity === "blocking")).toBe(true);
    expect(isPortraitAcceptable(turned)).toBe(false);

    const slight = inspectPortrait(goodPhoto({ yawDeg: PORTRAIT_RULES.turnWarnDeg + 2 }));
    expect(slight.every((found) => found.severity === "warning")).toBe(true);
    // Un avertissement n'empêche pas de garder la photo.
    expect(isPortraitAcceptable(slight)).toBe(true);
  });

  it("PHOTO-001 — les yeux fermés refusent la photo", () => {
    const issues = inspectPortrait(goodPhoto({ eyeOpenness: 0.05 }));

    expect(issues[0]?.code).toBe("eyes_closed");
    expect(isPortraitAcceptable(issues)).toBe(false);
  });

  it("PHOTO-001 — trop loin, trop près, trop sombre : autant de refus", () => {
    for (const [override, code] of [
      [{ faceHeightRatio: 0.1 }, "too_far"],
      [{ faceHeightRatio: 0.97 }, "too_close"],
      [{ brightness: 0.05 }, "too_dark"],
      [{ sharpness: 0.01 }, "blurry"],
      [{ faceMargin: -0.03 }, "cropped"],
    ] as const) {
      const issues = inspectPortrait(goodPhoto(override));
      expect(
        issues.some((found) => found.code === code && found.severity === "blocking"),
        `${code} devrait refuser la photo`,
      ).toBe(true);
    }
  });

  it("PHOTO-001 — un cadrage perfectible avertit sans refuser", () => {
    // Décentré, un peu loin, tête légèrement penchée : trois remarques, aucun
    // refus. Le recadrage automatique se charge du reste.
    const issues = inspectPortrait(
      goodPhoto({ faceHeightRatio: 0.24, faceMargin: 0.01, rollDeg: 15 }),
    );

    expect(issues.length).toBeGreaterThan(0);
    expect(isPortraitAcceptable(issues)).toBe(true);
  });

  it("PHOTO-001 — le plus grave se lit en premier", () => {
    const issues = inspectPortrait(
      goodPhoto({ rollDeg: 15, brightness: 0.05 }),
    );

    expect(issues[0]?.severity).toBe("blocking");
  });

  /**
   * Le port d'un couvre-chef n'est pas une mesure : rien dans les seuils ne
   * peut le refuser. Ce test protège ce choix d'une régression discrète.
   */
  it("PHOTO-001 — rien ne refuse une photo sur ce qui est porté", () => {
    const codes = inspectPortrait(goodPhoto()).map((found) => found.code);
    expect(codes).toEqual([]);

    const covered = inspectPortrait(goodPhoto({ faceHeightRatio: 0.45 }));
    expect(isPortraitAcceptable(covered)).toBe(true);
  });
});

describe("un détourage qui n'a rien laissé (PHOTO-001)", () => {
  it("PHOTO-001 — un masque muet efface tout, et on le refuse", () => {
    /*
     * Le cas qui a motivé cette garde : sur un émulateur Android sans pilote
     * graphique, le modèle se charge, ne lève aucune erreur, et rend un
     * masque dont toutes les confiances valent zéro. Chaque pixel devient
     * transparent et l'application propose une photo de profil vide.
     */
    expect(keepsSubject(0, 512 * 512)).toBe(false);
    expect(keepsSubject(120, 512 * 512)).toBe(false);
  });

  it("PHOTO-001 — un vrai portrait passe, même cadré large", () => {
    const total = 512 * 512;
    // Un visage en gros plan couvre la moitié de l'image ; une silhouette
    // lointaine, un dixième. Les deux sont des détourages valables.
    expect(keepsSubject(total / 2, total)).toBe(true);
    expect(keepsSubject(Math.round(total * 0.1), total)).toBe(true);
  });

  it("PHOTO-001 — une image sans pixel ne passe jamais", () => {
    // Division par zéro évitée, et la réponse prudente : il n'y a rien à
    // garder dans une image qui n'existe pas.
    expect(keepsSubject(0, 0)).toBe(false);
  });
});
