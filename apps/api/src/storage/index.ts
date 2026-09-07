import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError, ALLOWED_IMAGE_MIME_TYPES, LIMITS } from "@uno/shared";
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
  prefix: "avatars" | "products" | "venues",
): Promise<StoredImage> {
  if (buffer.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Fichier vide.");
  }
  if (buffer.length > LIMITS.uploadMaxBytes) {
    throw new AppError(
      "VALIDATION_ERROR",
      `L'image ne doit pas dépasser ${Math.round(LIMITS.uploadMaxBytes / (1024 * 1024))} Mo.`,
    );
  }

  const detected = detectImageType(buffer);
  if (
    !detected ||
    !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declaredMimeType) ||
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
 * Valide une URL d'image fournie par un administrateur (SHOP-006).
 * Seuls http(s) sont acceptés ; une URL malformée est refusée.
 */
export function assertValidImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL d'image invalide.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR", "URL d'image invalide.");
  }
  if (url.length > LIMITS.imageUrlMax) {
    throw new AppError("VALIDATION_ERROR", "URL d'image trop longue.");
  }
}
