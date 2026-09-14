import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

/**
 * Modèles de vision embarqués (PHOTO-001).
 *
 * Deux modèles tournent **sur l'appareil du joueur**, jamais sur un service
 * tiers : l'un sépare la personne de son fond, l'autre repère les points du
 * visage pour vérifier le cadrage. Une photo de visage est une donnée
 * sensible ; l'envoyer à une API de détourage pour gagner quelques lignes de
 * code aurait été le pire choix possible.
 *
 * Le moteur pèse 12 Mo et les modèles 4 Mo. Ils ne sont donc chargés qu'au
 * moment où l'écran de photo s'ouvre — jamais au démarrage — puis gardés en
 * mémoire pour le reste de la visite, et en cache par le navigateur pour les
 * suivantes.
 *
 * Tout échec est sans conséquence : si le moteur ne se charge pas (navigateur
 * sans SIMD, fichiers absents), la photo part telle quelle. Une préparation
 * qui échoue ne doit pas empêcher quelqu'un d'avoir une photo de profil.
 */

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const WASM_PATH = `${base}/vision/wasm`;
const SEGMENTER_MODEL = `${base}/vision/models/selfie_segmenter.tflite`;
const LANDMARKER_MODEL = `${base}/vision/models/face_landmarker.task`;

type Vision = typeof import("@mediapipe/tasks-vision");

let visionModule: Promise<Vision> | null = null;
let fileset: Promise<unknown> | null = null;
let segmenter: Promise<ImageSegmenter> | null = null;
let landmarker: Promise<FaceLandmarker> | null = null;

async function loadVision(): Promise<Vision> {
  visionModule ??= import("@mediapipe/tasks-vision");
  return visionModule;
}

async function loadFileset(): Promise<never> {
  const vision = await loadVision();
  fileset ??= vision.FilesetResolver.forVisionTasks(WASM_PATH);
  return fileset as Promise<never>;
}

/**
 * Le GPU d'abord, le processeur ensuite.
 *
 * WebGL n'est pas toujours disponible — navigateur en mode économie, pilote
 * refusé, machine virtuelle. La bascule coûte une seconde de plus au premier
 * chargement, contre une fonctionnalité qui ne marche pas du tout.
 */
async function createWithFallback<T>(
  build: (delegate: "GPU" | "CPU") => Promise<T>,
): Promise<T> {
  try {
    return await build("GPU");
  } catch {
    return build("CPU");
  }
}

export async function getSegmenter(): Promise<ImageSegmenter> {
  segmenter ??= (async () => {
    const vision = await loadVision();
    const files = await loadFileset();
    return createWithFallback((delegate) =>
      vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }),
    );
  })();

  return segmenter;
}

export async function getLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const vision = await loadVision();
    const files = await loadFileset();
    return createWithFallback((delegate) =>
      vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: LANDMARKER_MODEL, delegate },
        runningMode: "IMAGE",
        /**
         * Deux visages suffisent : on n'a pas besoin de les compter tous pour
         * savoir qu'il y en a plus d'un, et chercher au-delà ralentit
         * l'analyse sans rien apprendre.
         */
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
    );
  })();

  return landmarker;
}

/** Vrai si les modèles peuvent être chargés sur cet appareil. */
export async function visionAvailable(): Promise<boolean> {
  try {
    await loadFileset();
    return true;
  } catch {
    return false;
  }
}
