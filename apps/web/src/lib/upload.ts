import { ALLOWED_IMAGE_MIME_TYPES, AppError, LIMITS } from "@uno/shared";
import { isNative, sessionStore } from "./native.js";

/**
 * Téléversement d'une image vers l'API.
 *
 * Le fichier est envoyé tel quel dans le corps de la requête, avec son type
 * MIME en en-tête. Le serveur revalide la taille, le type déclaré ET les
 * octets de tête du fichier, puis choisit lui-même le nom de destination
 * (SEC-005) : rien de ce qui vient d'ici n'est pris pour argent comptant.
 */

function uploadUrl(kind: "avatars" | "products"): string {
  const base = import.meta.env["VITE_API_URL"];
  const prefix =
    typeof base === "string" && base.length > 0 ? base.replace(/\/$/, "") : "";
  return `${prefix}/uploads/${kind}`;
}

export interface UploadResult {
  url: string;
}

export async function uploadImage(
  file: File,
  kind: "avatars" | "products" = "avatars",
): Promise<UploadResult> {
  // Contrôles côté client : ils évitent un aller-retour réseau inutile, mais
  // ne remplacent jamais ceux du serveur.
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Format non supporté. Choisissez une image JPEG, PNG ou WebP.",
    );
  }
  if (file.size > LIMITS.uploadMaxBytes) {
    throw new AppError(
      "VALIDATION_ERROR",
      `L'image ne doit pas dépasser ${Math.round(LIMITS.uploadMaxBytes / (1024 * 1024))} Mo.`,
    );
  }

  const headers: Record<string, string> = { "content-type": file.type };
  if (isNative) {
    const token = await sessionStore.get();
    if (token) headers["authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(uploadUrl(kind), {
    method: "POST",
    credentials: "include",
    headers,
    body: file,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new AppError(
      "VALIDATION_ERROR",
      payload?.error ?? "Le téléversement a échoué.",
    );
  }

  return (await response.json()) as UploadResult;
}

/**
 * Réduit une image avant envoi.
 *
 * Une photo prise au téléphone pèse plusieurs mégaoctets pour un rendu final
 * de 400 px de côté : la redimensionner ici épargne du réseau à l'utilisateur
 * et du stockage au serveur. En cas d'échec, le fichier d'origine est renvoyé
 * tel quel — le serveur reste seul juge de sa validité.
 */
export async function shrinkImage(file: File, maxSize = 800): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (ratio >= 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (!blob) return file;

    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
