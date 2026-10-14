import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  AppError,
  ALLOWED_IMAGE_MIME_TYPES,
  LIMITS,
  gabarit,
} from "@uno/shared";
import { env } from "../env.js";

/**
 * Stockage des images (SEC-005).
 *
 * Trois contrôles avant écriture :
 *  1. la taille est bornée ;
 *  2. le type MIME déclaré est dans la liste blanche ;
 *  3. les octets de tête du fichier confirment ce type — un exécutable
 *     renommé en .jpg est donc refusé.
 *
 * Le nom de fichier est généré par le serveur (UUID) : le client ne contrôle
 * jamais le chemin d'écriture, ce qui exclut toute traversée de répertoire.
 */

export type ImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const EXTENSIONS: Record<ImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Vérifie la signature binaire du fichier (magic bytes). */
function detectImageType(buffer: Buffer): ImageMimeType | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export interface StoredImage {
  url: string;
  key: string;
  contentType: ImageMimeType;
  bytes: number;
}

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION ?? "auto",
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return s3Client;
}

export async function storeImage(
  buffer: Buffer,
  declaredMimeType: string,
  prefix:
    | "avatars"
    | "products"
    | "venues"
    | "squads"
    | "charities"
    | "tournaments"
    | "announcements",
): Promise<StoredImage> {
  if (buffer.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Fichier vide.");
  }
  if (buffer.length > LIMITS.uploadMaxBytes) {
    throw new AppError(
      "VALIDATION_ERROR",
      gabarit("L'image ne doit pas dépasser {taille} Mo.", {
        taille: Math.round(LIMITS.uploadMaxBytes / (1024 * 1024)),
      }),
    );
  }

  const detected = detectImageType(buffer);
  if (
    !detected ||
    !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(
      declaredMimeType,
    ) ||
    detected !== declaredMimeType
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Format non supporté. Utilisez une image JPEG, PNG ou WebP.",
    );
  }

  // Nom généré par le serveur : jamais celui fourni par l'utilisateur.
  const key = `${prefix}/${randomUUID()}.${EXTENSIONS[detected]}`;

  if (env.STORAGE_DRIVER === "s3") {
    await getS3().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: detected,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } else {
    const directory = join(env.STORAGE_LOCAL_DIR, prefix);
    await mkdir(directory, { recursive: true });
    await writeFile(join(env.STORAGE_LOCAL_DIR, key), buffer);
  }

  return {
    url: `${env.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${key}`,
    key,
    contentType: detected,
    bytes: buffer.length,
  };
}

/**
 * Une photo de joueur arrive détourée, donc transparente (PHOTO-003).
 *
 * L'application ne produit plus de JPEG pour une photo de profil : le
 * détourage rend un WebP ou un PNG, et s'il échoue, la photo n'est pas
 * envoyée. Un JPEG vient donc d'une version antérieure de l'application, qui
 * proposait encore de garder le fond — celle qu'un téléphone fait tourner
 * tant qu'il n'a pas reçu la mise à jour à chaud. Le refuser ici est la seule
 * façon de tenir la règle pour lui aussi.
 *
 * L'administration n'y est pas soumise : elle pose aussi des images d'essai,
 * et son propre écran détoure ce qu'elle choisit.
 */
export function assertAvatarCutOut(contentType: string, role: string): void {
  if (role === "admin") return;
  if (contentType === "image/jpeg") {
    // Le texte reste écrit ici, en clair : c'est là que le relevé du
    // catalogue des traductions va le chercher.
    throw new AppError(
      "VALIDATION_ERROR",
      "La photo doit être détourée : mettez l'application à jour, puis reprenez la photo.",
    );
  }
}

/**
 * Valide une URL d'image fournie par un administrateur (SHOP-006).
 * Seuls http(s) sont acceptés ; une URL malformée est refusée.
 */
export function assertValidImageUrl(url: string): void {
  if (url.length > LIMITS.imageUrlMax) {
    throw new AppError("VALIDATION_ERROR", "URL d'image trop longue.");
  }

  /**
   * Un chemin servi par la ligue (IMG-001), forme que prennent désormais les
   * fichiers envoyés. Il doit rester sous `/uploads` : la remontée de
   * répertoire est refusée, sinon une adresse enregistrée pourrait désigner
   * n'importe quel fichier du serveur.
   */
  if (url.startsWith("/")) {
    if (!/^\/uploads\/(?!.*\.\.)[A-Za-z0-9._\-/]+$/.test(url)) {
      throw new AppError("VALIDATION_ERROR", "URL d'image invalide.");
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL d'image invalide.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR", "URL d'image invalide.");
  }
}
