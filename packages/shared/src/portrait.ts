/**
 * Contrôle d'une photo de profil au format « carte d'identité » (PHOTO-001).
 *
 * Tout se mesure sur l'appareil du joueur : la photo n'est jamais envoyée à
 * un service tiers pour être jugée, et rien de ce qui est mesuré n'est
 * conservé. Ce fichier ne contient que la **décision** — les seuils et les
 * messages — pour qu'elle soit vérifiable par des tests, indépendamment du
 * modèle qui produit les mesures.
 *
 * Deux principes ont guidé les seuils :
 *
 *  - **ce qui bloque doit être incontestable** : pas de visage, plusieurs
 *    visages, un visage tourné au point qu'on ne le reconnaît plus, une photo
 *    floue ou noire. Ces cas-là, on les reprend en trois secondes ;
 *  - **le reste avertit sans interdire**. Un cadrage un peu haut ou une tête
 *    légèrement inclinée n'empêchent pas de reconnaître quelqu'un, et un
 *    refus de trop coûte plus cher qu'une photo imparfaite.
 *
 * Ce qui n'est **pas** contrôlé, délibérément : ce que la personne porte. Le
 * standard des photos officielles demande un visage visible du menton à la
 * racine des cheveux, les yeux dégagés — il n'interdit pas un couvre-chef.
 * Refuser un voile ou un turban serait discriminatoire, et aucun modèle
 * embarqué ne distingue de façon fiable une paire de lunettes d'une monture
 * de vue. L'écran demande donc de retirer lunettes de soleil, casquette et
 * masque ; ce sont les yeux visibles et le visage de face qui sont mesurés.
 */

/** Mesures brutes, produites par le modèle de repères faciaux. */
export interface PortraitMetrics {
  /** Nombre de visages détectés dans l'image. */
  faces: number;
  /** Hauteur du visage rapportée à celle de l'image, 0–1. */
  faceHeightRatio: number;
  /** Écart du centre du visage au centre de l'image, en fraction de côté. */
  offsetX: number;
  offsetY: number;
  /**
   * Marge entre le visage et le bord le plus proche, en fraction de côté.
   * Négative quand le visage dépasse du cadre — donc qu'il est coupé.
   */
  faceMargin: number;
  /** Rotations de la tête en degrés : lacet, tangage, roulis. */
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Ouverture des yeux, 0 = fermés, 1 = grands ouverts. */
  eyeOpenness: number;
  /** Netteté relative, 0 = uniforme, 1 = très contrastée localement. */
  sharpness: number;
  /** Luminosité moyenne, 0 = noir, 1 = blanc. */
  brightness: number;
}

export const PORTRAIT_ISSUE_CODES = [
  "no_face",
  "several_faces",
  "too_far",
  "too_close",
  "cropped",
  "turned",
  "tilted",
  "eyes_closed",
  "blurry",
  "too_dark",
  "too_bright",
] as const;
export type PortraitIssueCode = (typeof PORTRAIT_ISSUE_CODES)[number];

export interface PortraitIssue {
  code: PortraitIssueCode;
  /** `blocking` refuse la photo ; `warning` la laisse passer en le disant. */
  severity: "blocking" | "warning";
  message: string;
}

/**
 * Seuils du contrôle.
 *
 * Ils sont exportés pour que l'écran puisse guider avant la prise de vue —
 * dessiner le repère de cadrage au bon endroit — plutôt que de ne juger
 * qu'après coup.
 */
export const PORTRAIT_RULES = {
  /** Cadrage confortable : le visage occupe entre 30 % et 80 % de la hauteur. */
  faceHeightMin: 0.3,
  faceHeightMax: 0.8,
  /** En deçà et au-delà, le visage n'est plus exploitable sur une carte. */
  faceHeightHardMin: 0.16,
  faceHeightHardMax: 0.94,
  /**
   * Marge au bord : en dessous, le visage le frôle ; en négatif, il est coupé.
   *
   * Le décentrage, lui, n'est volontairement pas un critère. Le recadrage se
   * fait autour du visage : une tête sur le côté du cadre donne exactement le
   * même portrait qu'une tête centrée. Le reprocher revenait à signaler un
   * défaut que l'application venait de corriger, ce que l'essai a confirmé sur
   * une photo parfaitement utilisable.
   */
  faceMarginWarn: 0.02,
  /** Tête tournée ou penchée : toléré, puis refusé. */
  turnWarnDeg: 12,
  turnBlockDeg: 24,
  tiltWarnDeg: 10,
  tiltBlockDeg: 22,
  /** Yeux : en dessous, on considère qu'ils sont fermés. */
  eyesClosed: 0.18,
  eyesHalfOpen: 0.3,
  /** Netteté et lumière. */
  sharpnessMin: 0.06,
  sharpnessWarn: 0.1,
  brightnessMin: 0.16,
  brightnessMax: 0.9,
} as const;

function issue(
  code: PortraitIssueCode,
  severity: PortraitIssue["severity"],
  message: string,
): PortraitIssue {
  return { code, severity, message };
}

/**
 * Ce qui cloche dans cette photo, du plus grave au plus anodin.
 *
 * Une liste vide vaut « bonne photo ». La présence d'un seul `blocking`
 * suffit à la refuser : c'est `isPortraitAcceptable` qui tranche, pour que
 * l'écran n'ait pas à réinventer la règle.
 */
export function inspectPortrait(metrics: PortraitMetrics): PortraitIssue[] {
  // Sans visage, aucune autre mesure n'a de sens : on s'arrête là plutôt que
  // d'empiler des reproches sur une photo de mur.
  if (metrics.faces === 0) {
    return [
      issue(
        "no_face",
        "blocking",
        "Aucun visage détecté. Placez votre visage dans le repère.",
      ),
    ];
  }
  if (metrics.faces > 1) {
    return [
      issue(
        "several_faces",
        "blocking",
        "Plusieurs visages sont visibles : la photo doit ne montrer que vous.",
      ),
    ];
  }

  const found: PortraitIssue[] = [];
  const rules = PORTRAIT_RULES;

  if (metrics.faceHeightRatio < rules.faceHeightHardMin) {
    found.push(
      issue("too_far", "blocking", "Vous êtes trop loin : rapprochez-vous."),
    );
  } else if (metrics.faceHeightRatio > rules.faceHeightHardMax) {
    found.push(
      issue("too_close", "blocking", "Vous êtes trop près : reculez un peu."),
    );
  } else if (metrics.faceHeightRatio < rules.faceHeightMin) {
    found.push(
      issue("too_far", "warning", "Rapprochez-vous un peu pour mieux remplir le cadre."),
    );
  } else if (metrics.faceHeightRatio > rules.faceHeightMax) {
    found.push(
      issue("too_close", "warning", "Reculez légèrement : le visage déborde du cadre."),
    );
  }

  if (metrics.faceMargin < 0) {
    found.push(
      issue(
        "cropped",
        "blocking",
        "Votre visage est coupé par le bord : reculez ou recentrez-vous.",
      ),
    );
  } else if (metrics.faceMargin < rules.faceMarginWarn) {
    found.push(
      issue("cropped", "warning", "Votre visage touche le bord du cadre."),
    );
  }


  const turn = Math.max(Math.abs(metrics.yawDeg), Math.abs(metrics.pitchDeg));
  if (turn > rules.turnBlockDeg) {
    found.push(
      issue("turned", "blocking", "Regardez droit vers l'objectif, sans tourner la tête."),
    );
  } else if (turn > rules.turnWarnDeg) {
    found.push(issue("turned", "warning", "Tournez-vous légèrement vers l'objectif."));
  }

  const tilt = Math.abs(metrics.rollDeg);
  if (tilt > rules.tiltBlockDeg) {
    found.push(issue("tilted", "blocking", "Redressez la tête : elle est trop penchée."));
  } else if (tilt > rules.tiltWarnDeg) {
    found.push(issue("tilted", "warning", "Votre tête est un peu penchée."));
  }

  if (metrics.eyeOpenness < rules.eyesClosed) {
    found.push(
      issue(
        "eyes_closed",
        "blocking",
        "Vos yeux doivent être ouverts et visibles. Retirez vos lunettes de soleil.",
      ),
    );
  } else if (metrics.eyeOpenness < rules.eyesHalfOpen) {
    found.push(issue("eyes_closed", "warning", "Ouvrez bien les yeux."));
  }

  if (metrics.sharpness < rules.sharpnessMin) {
    found.push(issue("blurry", "blocking", "La photo est floue : tenez l'appareil immobile."));
  } else if (metrics.sharpness < rules.sharpnessWarn) {
    found.push(issue("blurry", "warning", "La photo manque un peu de netteté."));
  }

  if (metrics.brightness < rules.brightnessMin) {
    found.push(issue("too_dark", "blocking", "Il fait trop sombre : placez-vous face à la lumière."));
  } else if (metrics.brightness > rules.brightnessMax) {
    found.push(
      issue("too_bright", "warning", "La photo est surexposée : éloignez-vous de la lumière directe."),
    );
  }

  // Le plus grave d'abord : c'est la première ligne que l'on lit.
  return found.sort((left, right) =>
    left.severity === right.severity ? 0 : left.severity === "blocking" ? -1 : 1,
  );
}

/** Vrai si la photo peut être conservée — les avertissements n'empêchent rien. */
export function isPortraitAcceptable(issues: readonly PortraitIssue[]): boolean {
  return !issues.some((found) => found.severity === "blocking");
}
