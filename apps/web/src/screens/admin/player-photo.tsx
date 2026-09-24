import { useEffect, useRef, useState } from "react";
import { ImagePlus, Link2, Trash2 } from "lucide-react";
import { toCardPlayer } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { shrinkImage, uploadImage } from "@/lib/upload.js";
import { Avatar } from "@/components/domain/index.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { Async } from "@/components/ui/async.js";
import { Button, ErrorBanner, Input } from "@/components/ui/index.js";
import { useT } from "@/lib/i18n.js";

/**
 * Photo d'un joueur ou d'un arbitre, posée par l'administration (ADMIN-009).
 *
 * Le serveur acceptait déjà `profilePhotoUrl` et `photoOffsetY` dans la
 * correction d'un joueur ; seul l'écran manquait. Le geste sert d'abord aux
 * essais — une carte sans visage se juge mal —, mais il a aussi son usage
 * ordinaire : retirer une photo qui n'a rien à faire là.
 *
 * **L'aperçu est la carte réelle**, pas une vignette. Le cadrage vertical se
 * règle donc sur ce qui sera effectivement affiché : un visage centré dans un
 * carré ne l'est pas dans une carte FUT, et le découvrir après coup obligeait
 * à recommencer.
 *
 * Deux différences avec la prise de photo d'un joueur, assumées. Pas de
 * caméra : l'administration choisit un fichier, elle n'est pas devant le
 * sujet. Pas de détourage automatique : les quinze mégaoctets de modèles de
 * vision ne se chargent pas pour poser une image d'essai — et une photo déjà
 * détourée le reste.
 */
export function PlayerPhotoEditor({ playerId }: { playerId: number }) {
  const t = useT();
  const utils = trpc.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const profile = trpc.admin.player.useQuery({ playerId }, { enabled: open });
  const update = trpc.admin.updatePlayer.useMutation();

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [offsetY, setOffsetY] = useState(35);
  const [pasted, setPasted] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setPhotoUrl(profile.data.profilePhotoUrl);
    setOffsetY(profile.data.photoOffsetY);
  }, [profile.data]);

  async function onFileChosen(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    setUploading(true);
    try {
      // Réduite avant l'envoi, comme partout ailleurs : une photo de reflex
      // pèse le double de la limite du serveur.
      const reduced = await shrinkImage(file, 1200);
      const result = await uploadImage(reduced, "avatars");
      setPhotoUrl(result.url);
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    void tapFeedback();
    setError(null);
    setNotice(null);
    try {
      await update.mutateAsync({
        playerId,
        profilePhotoUrl: photoUrl,
        photoOffsetY: offsetY,
      });
      /*
       * La photo voyage loin : la fiche du joueur, les cartes de l'effectif
       * d'un club, le terrain, les listes de session. Invalider seulement la
       * fiche d'administration aurait laissé l'ancienne partout ailleurs
       * jusqu'au prochain rechargement.
       */
      await Promise.all([
        utils.admin.player.invalidate({ playerId }),
        utils.admin.players.invalidate(),
        utils.players.invalidate(),
        utils.squads.invalidate(),
      ]);
      setNotice(t("admin.photo.saved"));
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
      >
        <ImagePlus className="size-4" aria-hidden />
        {t("admin.photo.title")}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-surface p-3">
      <Async query={profile}>
        {(data) => (
          <>
            <div className="flex flex-col items-center gap-3">
              {photoUrl ? (
                <FutCard
                  player={{
                    ...toCardPlayer(data),
                    profilePhotoUrl: photoUrl,
                    photoOffsetY: offsetY,
                  }}
                  size="md"
                  animated={false}
                />
              ) : (
                <Avatar name={data.displayName} url={null} size="xl" />
              )}

              {photoUrl && (
                <div className="w-full max-w-[240px]">
                  <label
                    htmlFor={`offset-${playerId}`}
                    className="mb-1.5 block text-center text-xs font-medium text-muted"
                  >
                    {t("admin.photo.offset")}
                  </label>
                  <input
                    id={`offset-${playerId}`}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={offsetY}
                    onChange={(event) => setOffsetY(Number(event.target.value))}
                    className="w-full accent-[#F97316]"
                    aria-label={t("admin.photo.offsetAria")}
                  />
                </div>
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onFileChosen(event.target.files)}
            />

            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden />
                {photoUrl ? t("admin.photo.replace") : t("admin.photo.choose")}
              </Button>
              {photoUrl && (
                <Button
                  variant="ghost"
                  aria-label={t("admin.photo.remove")}
                  onClick={() => {
                    void tapFeedback();
                    setPhotoUrl(null);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                inputMode="url"
                placeholder={t("admin.images.pasteUrl")}
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
              />
              <Button
                variant="secondary"
                aria-label={t("admin.photo.useUrl")}
                disabled={pasted.trim() === ""}
                onClick={() => {
                  setPhotoUrl(pasted.trim());
                  setPasted("");
                }}
              >
                <Link2 className="size-4" aria-hidden />
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted">
              {/* Dire ce qui n'est pas fait ici évite de croire à une panne. */}
              {t("admin.photo.noCutout")}
            </p>

            {error && <ErrorBanner message={error} />}
            {notice && (
              <p role="status" className="text-center text-xs text-success">
                {notice}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                {t("common.close")}
              </Button>
              <Button
                variant="accent"
                className="flex-1"
                loading={update.isPending}
                onClick={() => void save()}
              >
                {t("admin.save")}
              </Button>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
