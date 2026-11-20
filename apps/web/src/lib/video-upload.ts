import type { VideoUploadTicket } from "@uno/shared";

/**
 * L'envoi d'un fichier vidéo, directement vers le stockage (SUP-004).
 *
 * Le serveur signe une adresse par morceau ; le navigateur envoie les
 * morceaux lui-même, trois à la fois, et rend au serveur l'empreinte (ETag)
 * que le stockage a donnée à chacun pour qu'il les assemble. Un morceau raté
 * est renvoyé jusqu'à trois fois avant d'abandonner l'envoi entier : sur une
 * heure de match, une coupure Wi-Fi ne doit pas tout faire recommencer.
 *
 * `XMLHttpRequest` plutôt que `fetch` : lui seul dit où en est l'envoi.
 */

const PARALLEL = 3;
const ATTEMPTS = 3;

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export class UploadAborted extends Error {}

function putPart(
  url: string,
  body: Blob,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        // Sans ETag lisible, le stockage n'expose pas l'en-tête au site :
        // c'est la règle CORS du bucket qui manque (docs/DEPLOIEMENT.md).
        if (etag) resolve(etag);
        else reject(new Error("etag"));
      } else {
        reject(new Error(`http ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new UploadAborted());
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/**
 * Envoie `file` morceau par morceau aux adresses du ticket. `onProgress`
 * reçoit la part déjà envoyée, de 0 à 1.
 */
export async function uploadParts(
  file: File,
  ticket: VideoUploadTicket,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<UploadedPart[]> {
  const sent = new Array<number>(ticket.urls.length).fill(0);
  const report = () =>
    onProgress(
      Math.min(1, sent.reduce((a, b) => a + b, 0) / Math.max(1, file.size)),
    );
  const parts: UploadedPart[] = [];
  let next = 0;

  async function worker() {
    while (next < ticket.urls.length) {
      const index = next;
      next += 1;
      const start = index * ticket.partBytes;
      const blob = file.slice(
        start,
        Math.min(file.size, start + ticket.partBytes),
      );
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        if (signal.aborted) throw new UploadAborted();
        try {
          const etag = await putPart(
            ticket.urls[index] as string,
            blob,
            (loaded) => {
              sent[index] = loaded;
              report();
            },
            signal,
          );
          sent[index] = blob.size;
          report();
          parts.push({ partNumber: index + 1, etag });
          lastError = null;
          break;
        } catch (error) {
          if (error instanceof UploadAborted) throw error;
          lastError = error;
          sent[index] = 0;
          if (error instanceof Error && error.message === "etag") break;
        }
      }
      if (lastError) throw lastError;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, ticket.urls.length) }, () =>
      worker(),
    ),
  );
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}
