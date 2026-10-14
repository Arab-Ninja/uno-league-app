import { useState } from "react";
import { Eraser, Search } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { imageSrc } from "@/lib/images.js";
import { eraseBackgroundOf, hasTransparentBackground } from "@/lib/portrait.js";
import { uploadImage } from "@/lib/upload.js";
import { tapFeedback } from "@/lib/native.js";
import { Button, Card, ErrorBanner } from "@/components/ui/index.js";
import { useT } from "@/lib/i18n.js";

/**
 * Retirer le fond des photos déjà en place (PHOTO-003).
 *
 * Le détourage est devenu obligatoire après coup : des joueurs avaient gardé
 * le fond de leur photo, et leur carte affichait une cuisine ou un canapé.
 * Le serveur ne sait pas lire une image ; c'est donc l'appareil de
 * l'administrateur qui fait le travail, avec le modèle même de la prise de
 * photo des joueurs.
 *
 * Deux temps, et non un seul bouton : d'abord **chercher** — chaque photo est
 * lue, et seules celles dont le pourtour est opaque sont retenues —, puis
 * **détourer** ce qui a été trouvé. L'administrateur voit combien de photos
 * vont changer avant que rien ne change.
 *
 * Ce qui ne se détoure pas reste **tel quel** : une photo avec son fond vaut
 * mieux qu'un cadre vide. La photo d'origine n'est pas effacée du stockage,
 * et le cadrage du joueur est gardé à l'identique.
 */

interface PlayerPhoto {
  playerId: number;
  displayName: string;
  profilePhotoUrl: string | null;
}

type Stage =
  | { kind: "idle" }
  | { kind: "scanning"; done: number; total: number }
  | {
      kind: "found";
      withBackground: PlayerPhoto[];
      unreadable: string[];
      total: number;
    }
  | { kind: "running"; done: number; total: number }
  | { kind: "finished"; cutOut: number; failed: string[] };

/**
 * Lit une photo en mémoire.
 *
 * Par `fetch` plutôt que par une balise `img` : une image d'un autre domaine
 * dessinée sur un canevas le rend illisible, alors qu'une réponse lue comme
 * un fichier ne l'est pas.
 */
async function loadBitmap(stored: string): Promise<ImageBitmap> {
  const address = imageSrc(stored);
  if (!address) throw new Error("Adresse vide");
  const response = await fetch(address);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return createImageBitmap(await response.blob());
}

export function PhotoBackgroundCleanup() {
  const t = useT();
  const utils = trpc.useUtils();
  const update = trpc.admin.updatePlayer.useMutation();

  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    void tapFeedback();
    setError(null);

    let photos: PlayerPhoto[];
    try {
      // Relue au serveur, jamais en cache : une seconde recherche juste après
      // un détourage doit voir les nouvelles photos, pas les anciennes.
      photos = await utils.admin.playerPhotos.fetch(undefined, {
        staleTime: 0,
      });
    } catch (caught) {
      setError(describeError(caught).message);
      return;
    }

    const withBackground: PlayerPhoto[] = [];
    const unreadable: string[] = [];
    setStage({ kind: "scanning", done: 0, total: photos.length });

    for (const [index, photo] of photos.entries()) {
      if (photo.profilePhotoUrl) {
        try {
          const bitmap = await loadBitmap(photo.profilePhotoUrl);
          if (!hasTransparentBackground(bitmap)) withBackground.push(photo);
          bitmap.close();
        } catch {
          unreadable.push(photo.displayName);
        }
      }
      setStage({ kind: "scanning", done: index + 1, total: photos.length });
    }

    setStage({
      kind: "found",
      withBackground,
      unreadable,
      total: photos.length,
    });
  }

  async function run(photos: PlayerPhoto[]) {
    void tapFeedback();
    setError(null);

    let cutOut = 0;
    const failed: string[] = [];
    setStage({ kind: "running", done: 0, total: photos.length });

    // Une photo après l'autre : le modèle tourne sur l'appareil, et dix
    // détourages en parallèle figeraient l'écran sans aller plus vite.
    for (const [index, photo] of photos.entries()) {
      try {
        const bitmap = await loadBitmap(photo.profilePhotoUrl ?? "");
        const file = await eraseBackgroundOf(bitmap);
        bitmap.close();

        if (file) {
          const { url } = await uploadImage(file, "avatars");
          await update.mutateAsync({
            playerId: photo.playerId,
            profilePhotoUrl: url,
            reason: "Détourage de la photo de profil",
          });
          cutOut++;
        } else {
          failed.push(photo.displayName);
        }
      } catch {
        failed.push(photo.displayName);
      }
      setStage({ kind: "running", done: index + 1, total: photos.length });
    }

    // La photo voyage loin : fiche, effectif d'un club, terrain, listes.
    await Promise.all([
      utils.admin.playerPhotos.invalidate(),
      utils.admin.player.invalidate(),
      utils.admin.players.invalidate(),
      utils.players.invalidate(),
      utils.squads.invalidate(),
    ]);

    setStage({ kind: "finished", cutOut, failed });
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{t("admin.photoCleanup.title")}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {t("admin.photoCleanup.lead")}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {(stage.kind === "idle" || stage.kind === "finished") && (
        <Button
          variant="secondary"
          fullWidth
          icon={<Search className="size-4" aria-hidden />}
          onClick={() => void scan()}
        >
          {t("admin.photoCleanup.scan")}
        </Button>
      )}

      {stage.kind === "scanning" && (
        <p role="status" className="text-center text-xs text-muted">
          {t("admin.photoCleanup.scanning", {
            done: stage.done,
            total: stage.total,
          })}
        </p>
      )}

      {stage.kind === "found" && (
        <div className="space-y-2">
          <p role="status" className="text-center text-xs text-muted">
            {stage.withBackground.length === 0
              ? t("admin.photoCleanup.none")
              : t("admin.photoCleanup.found", {
                  count: stage.withBackground.length,
                  total: stage.total,
                })}
          </p>
          {stage.unreadable.length > 0 && (
            <p className="text-center text-[11px] text-muted">
              {t("admin.photoCleanup.failed", {
                names: stage.unreadable.join(", "),
              })}
            </p>
          )}
          {stage.withBackground.length > 0 && (
            <Button
              variant="accent"
              fullWidth
              icon={<Eraser className="size-4" aria-hidden />}
              onClick={() => void run(stage.withBackground)}
            >
              {t("admin.photoCleanup.run", {
                count: stage.withBackground.length,
              })}
            </Button>
          )}
        </div>
      )}

      {stage.kind === "running" && (
        <p role="status" className="text-center text-xs text-muted">
          {t("admin.photoCleanup.running", {
            done: stage.done,
            total: stage.total,
          })}
        </p>
      )}

      {stage.kind === "finished" && (
        <div className="space-y-1 text-center">
          <p role="status" className="text-xs text-success">
            {t("admin.photoCleanup.done", { count: stage.cutOut })}
          </p>
          {stage.failed.length > 0 && (
            <p className="text-[11px] text-muted">
              {t("admin.photoCleanup.failed", {
                names: stage.failed.join(", "),
              })}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
