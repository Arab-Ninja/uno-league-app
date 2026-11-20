import { randomUUID } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError, VIDEO_UPLOAD, type VideoRole } from "@uno/shared";
import { env } from "../env.js";
import { getS3 } from "./index.js";

/**
 * Les fichiers vidéo des séances (SUP-004), dans un bucket privé.
 *
 * **Le serveur ne porte jamais les octets.** Une heure de match pèse un
 * gigaoctet : l'administrateur l'envoie directement au stockage, par morceaux,
 * à des adresses que le serveur signe pour lui ; les joueurs la lisent de la
 * même façon. Le serveur ne fait que signer — pour un envoi, à l'administrateur
 * qui l'a ouvert ; pour une lecture, à qui a joué la séance.
 *
 * Les adresses de lecture sont signées **à l'heure pile** : redemandées dans
 * la même heure, elles sont identiques, et un lecteur en cours ne repart pas
 * de zéro parce que la page a rafraîchi ses données.
 */

/** Une adresse de lecture vaut au moins six heures : un match, et la suite. */
const READ_TTL_S = 7 * 3600;
/** Un envoi d'une heure de match sur une connexion modeste : la journée. */
const UPLOAD_TTL_S = 12 * 3600;

export function videoStorageEnabled(): boolean {
  return Boolean(
    env.S3_VIDEO_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY,
  );
}

function bucket(): string {
  if (!videoStorageEnabled()) {
    throw new AppError(
      "RULE_VIOLATION",
      "Le stockage des vidéos n'est pas configuré : collez un lien à la place.",
    );
  }
  return env.S3_VIDEO_BUCKET as string;
}

/** La clé d'un nouveau fichier : la séance, le rôle, et un nom que personne ne devine. */
export function newVideoKey(proposalId: number, role: VideoRole): string {
  return `seances/${proposalId}/${role}-${randomUUID()}.mp4`;
}

/** La clé appartient-elle bien à cette séance et à ce rôle ? */
export function isVideoKeyOf(
  key: string,
  proposalId: number,
  role: VideoRole,
): boolean {
  return new RegExp(`^seances/${proposalId}/${role}-[0-9a-f-]{36}\\.mp4$`).test(
    key,
  );
}

export function partCount(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / VIDEO_UPLOAD.partBytes));
}

export async function startMultipartUpload(
  key: string,
  bytes: number,
): Promise<{ uploadId: string; urls: string[] }> {
  const client = getS3();
  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: VIDEO_UPLOAD.contentType,
    }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) {
    throw new AppError("INTERNAL", "Le stockage n'a pas ouvert l'envoi.");
  }
  const urls: string[] = [];
  for (let n = 1; n <= partCount(bytes); n += 1) {
    urls.push(
      await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket(),
          Key: key,
          UploadId: uploadId,
          PartNumber: n,
        }),
        { expiresIn: UPLOAD_TTL_S },
      ),
    );
  }
  return { uploadId, urls };
}

/** Assemble les morceaux reçus, et rend la taille du fichier obtenu. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<number> {
  const client = getS3();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket(), Key: key }),
  );
  return Number(head.ContentLength ?? 0);
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<void> {
  await getS3().send(
    new AbortMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export async function signedVideoUrl(
  key: string,
  now = new Date(),
): Promise<string> {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: READ_TTL_S, signingDate: hour },
  );
}

export async function deleteVideoObject(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
