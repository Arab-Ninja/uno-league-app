import {
  inspectPortrait,
  isPortraitAcceptable,
  type PortraitIssue,
  type PortraitMetrics,
} from "@uno/shared";
import { getLandmarker, getSegmenter } from "./vision.js";

/**
 * Préparation d'une photo de profil (PHOTO-001, PHOTO-002).
 *
 * Deux gestes, tous deux sur l'appareil :
 *
 *  1. **mesurer** le visage — combien, où, tourné de combien, yeux ouverts —
 *     pour dire au joueur ce qui ne va pas avant qu'il ne garde la photo ;
 *  2. **détourer** la personne de son fond, pour que la carte affiche un
 *     portrait découpé plutôt qu'un morceau de cuisine.
 *
 * Le jugement lui-même — quel écart refuse une photo — vit dans le paquet
 * partagé, avec ses tests. Ici, on ne fait que produire les mesures et les
 * pixels.
 */

/** Cadre du visage, en fraction de l'image (0–1). */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PortraitAnalysis {
  metrics: PortraitMetrics;
  issues: PortraitIssue[];
  acceptable: boolean;
  face: FaceBox | null;
}

/** Repères des paupières, pour l'ouverture des yeux. */
const BLINK_SHAPES = ["eyeBlinkLeft", "eyeBlinkRight"];

/**
 * Angles de la tête à partir de la matrice de transformation du visage.
 *
 * MediaPipe la donne en colonnes (16 flottants) ; la décomposition ZYX rend
 * le tangage, le lacet et le roulis — dans cet ordre, et en radians.
 */
function headAngles(matrix: readonly number[]): {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
} {
  const at = (row: number, col: number) => matrix[col * 4 + row] ?? 0;

  const sy = Math.hypot(at(0, 0), at(1, 0));
  const degrees = (radians: number) => (radians * 180) / Math.PI;

  if (sy > 1e-6) {
    return {
      pitchDeg: degrees(Math.atan2(at(2, 1), at(2, 2))),
      yawDeg: degrees(Math.atan2(-at(2, 0), sy)),
      rollDeg: degrees(Math.atan2(at(1, 0), at(0, 0))),
    };
  }

  // Cas dégénéré (tête à 90°) : le roulis n'est plus séparable du lacet.
  return {
    pitchDeg: degrees(Math.atan2(-at(1, 2), at(1, 1))),
    yawDeg: degrees(Math.atan2(-at(2, 0), sy)),
    rollDeg: 0,
  };
}

/** Netteté et luminosité d'une zone de l'image, mesurées sur une vignette. */
function imageQuality(
  source: CanvasImageSource,
  width: number,
  height: number,
  region: FaceBox | null,
): { sharpness: number; brightness: number } {
  const side = 128;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { sharpness: 1, brightness: 0.5 };

  /**
   * La mesure porte sur le visage, pas sur toute l'image : un fond net
   * derrière un visage flou donnerait une photo jugée bonne, alors que c'est
   * exactement celle qu'il faut reprendre.
   */
  const box = region ?? { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
  context.drawImage(
    source,
    box.x * width,
    box.y * height,
    Math.max(1, box.width * width),
    Math.max(1, box.height * height),
    0,
    0,
    side,
    side,
  );

  const { data } = context.getImageData(0, 0, side, side);
  const grey = new Float32Array(side * side);
  let sum = 0;

  for (let index = 0; index < grey.length; index++) {
    const offset = index * 4;
    // Luminance perçue : le vert pèse plus que le rouge, et le bleu presque rien.
    const value =
      0.2126 * (data[offset] ?? 0) +
      0.7152 * (data[offset + 1] ?? 0) +
      0.0722 * (data[offset + 2] ?? 0);
    grey[index] = value;
    sum += value;
  }

  // Variance du laplacien : une image floue n'a pas de transitions brusques.
  let energy = 0;
  let counted = 0;
  for (let y = 1; y < side - 1; y++) {
    for (let x = 1; x < side - 1; x++) {
      const index = y * side + x;
      const laplacian =
        4 * (grey[index] ?? 0) -
        (grey[index - 1] ?? 0) -
        (grey[index + 1] ?? 0) -
        (grey[index - side] ?? 0) -
        (grey[index + side] ?? 0);
      energy += laplacian * laplacian;
      counted++;
    }
  }

  return {
    sharpness: counted === 0 ? 1 : Math.sqrt(energy / counted) / 255,
    brightness: sum / grey.length / 255,
  };
}

/**
 * Mesure une photo et dit ce qui ne va pas.
 *
 * Renvoie `null` si les modèles ne sont pas chargeables : l'appelant garde
 * alors la photo telle quelle plutôt que de refuser un joueur pour une raison
 * qui ne le concerne pas.
 */
export async function analysePortrait(
  bitmap: ImageBitmap,
): Promise<PortraitAnalysis | null> {
  let result;
  try {
    const landmarker = await getLandmarker();
    result = landmarker.detect(bitmap);
  } catch {
    return null;
  }

  const landmarks = result.faceLandmarks ?? [];
  const faces = landmarks.length;

  if (faces === 0) {
    const quality = imageQuality(bitmap, bitmap.width, bitmap.height, null);
    const metrics: PortraitMetrics = {
      faces: 0,
      faceHeightRatio: 0,
      offsetX: 0,
      offsetY: 0,
      faceMargin: 1,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      eyeOpenness: 0,
      ...quality,
    };
    const issues = inspectPortrait(metrics);
    return { metrics, issues, acceptable: isPortraitAcceptable(issues), face: null };
  }

  const points = landmarks[0]!;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const face: FaceBox = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
  const blink = blendshapes
    .filter((shape) => BLINK_SHAPES.includes(shape.categoryName))
    .map((shape) => shape.score);
  const eyeOpenness = blink.length === 0 ? 1 : 1 - Math.max(...blink);

  const matrix = result.facialTransformationMatrixes?.[0]?.data ?? [];
  const angles =
    matrix.length === 16
      ? headAngles(Array.from(matrix))
      : { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };

  const quality = imageQuality(bitmap, bitmap.width, bitmap.height, face);

  const metrics: PortraitMetrics = {
    faces,
    /**
     * Les repères s'arrêtent au front, pas à la racine des cheveux : le
     * visage mesuré est un peu plus court que ce qu'on en voit. Le facteur
     * rétablit l'ordre de grandeur d'une tête entière, sur lequel les seuils
     * de cadrage ont été réglés.
     */
    faceHeightRatio: Math.min(1, face.height * 1.35),
    offsetX: face.x + face.width / 2 - 0.5,
    offsetY: face.y + face.height / 2 - 0.5,
    /**
     * Les repères débordent de l'image quand le visage est coupé par le
     * bord : la marge devient alors négative, et c'est ce cas-là — pas le
     * décentrage — qui justifie de reprendre la photo.
     */
    faceMargin: Math.min(
      face.x,
      face.y,
      1 - (face.x + face.width),
      1 - (face.y + face.height),
    ),
    ...angles,
    eyeOpenness,
    ...quality,
  };

  const issues = inspectPortrait(metrics);
  return { metrics, issues, acceptable: isPortraitAcceptable(issues), face };
}

/**
 * Cadre carré à découper autour du visage, à la manière d'une photo
 * officielle : la tête occupe environ les deux tiers de la hauteur, et le
 * regard se situe au tiers supérieur.
 */
function framing(
  face: FaceBox | null,
  width: number,
  height: number,
): { x: number; y: number; size: number } {
  const shortest = Math.min(width, height);
  if (!face) {
    return {
      x: (width - shortest) / 2,
      y: (height - shortest) / 2,
      size: shortest,
    };
  }

  const faceHeight = face.height * height;
  const size = Math.min(shortest, Math.max(faceHeight * 1.9, shortest * 0.35));
  const centreX = (face.x + face.width / 2) * width;
  const centreY = (face.y + face.height / 2) * height;

  return {
    x: Math.min(Math.max(0, centreX - size / 2), width - size),
    // Un peu d'air au-dessus de la tête : le portrait respire, et les
    // cheveux ne sont pas coupés au ras du crâne.
    y: Math.min(Math.max(0, centreY - size * 0.56), height - size),
    size,
  };
}

/** Résultat du détourage : l'image découpée, et si le fond a bien été retiré. */
export interface CutOutResult {
  file: File;
  backgroundRemoved: boolean;
}

/**
 * Détoure la personne et recadre la photo (PHOTO-002).
 *
 * Le masque de segmentation devient le canal alpha : ce qui est « personne »
 * reste opaque, le reste disparaît. Le seuil est adouci sur une plage plutôt
 * que tranché net, sinon les contours des cheveux deviennent un escalier.
 *
 * En cas d'échec du modèle, la photo est simplement recadrée : un fond
 * conservé vaut mieux qu'une photo refusée.
 */
export async function cutOutPortrait(
  bitmap: ImageBitmap,
  face: FaceBox | null,
  options: { removeBackground?: boolean; size?: number } = {},
): Promise<CutOutResult> {
  const output = options.size ?? 512;
  const frame = framing(face, bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas indisponible");

  context.drawImage(
    bitmap,
    frame.x,
    frame.y,
    frame.size,
    frame.size,
    0,
    0,
    output,
    output,
  );

  let backgroundRemoved = false;

  if (options.removeBackground !== false) {
    try {
      const segmenter = await getSegmenter();
      const cropped = await createImageBitmap(canvas);
      const segmentation = segmenter.segment(cropped);
      const mask = segmentation.confidenceMasks?.[0];

      if (mask) {
        const values = mask.getAsFloat32Array();
        const image = context.getImageData(0, 0, output, output);
        const maskWidth = mask.width;
        const maskHeight = mask.height;

        for (let y = 0; y < output; y++) {
          // Le masque peut être rendu à une autre résolution que la vignette :
          // on y pioche au plus proche plutôt que de supposer qu'elle colle.
          const maskY = Math.min(
            maskHeight - 1,
            Math.floor((y / output) * maskHeight),
          );
          for (let x = 0; x < output; x++) {
            const maskX = Math.min(
              maskWidth - 1,
              Math.floor((x / output) * maskWidth),
            );
            const confidence = values[maskY * maskWidth + maskX] ?? 0;
            // Transition douce entre 35 % et 70 % de confiance.
            const alpha = Math.min(
              1,
              Math.max(0, (confidence - 0.35) / 0.35),
            );
            image.data[(y * output + x) * 4 + 3] = Math.round(alpha * 255);
          }
        }

        context.putImageData(image, 0, 0);
        backgroundRemoved = true;
      }

      cropped.close();
      segmentation.close();
    } catch {
      backgroundRemoved = false;
    }
  }

  const blob = await toBlob(canvas, backgroundRemoved);
  const extension = blob.type === "image/webp" ? "webp" : "png";

  return {
    file: new File([blob], `portrait.${extension}`, { type: blob.type }),
    backgroundRemoved,
  };
}

/**
 * WebP quand le navigateur sait l'écrire, PNG sinon.
 *
 * Les deux gardent la transparence ; le WebP pèse trois à quatre fois moins,
 * ce qui compte pour une image que l'on regarde sur un forfait mobile. Sans
 * détourage, le JPEG suffit et pèse encore moins.
 */
async function toBlob(
  canvas: HTMLCanvasElement,
  transparent: boolean,
): Promise<Blob> {
  const attempts: [type: string, quality: number][] = transparent
    ? [
        ["image/webp", 0.92],
        ["image/png", 1],
      ]
    : [
        ["image/jpeg", 0.9],
        ["image/png", 1],
      ];

  for (const [type, quality] of attempts) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
    if (blob && blob.type === type) return blob;
  }

  throw new Error("Impossible d'encoder la photo");
}
