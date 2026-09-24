import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, X } from "lucide-react";
import { LIMITS } from "@uno/shared";
import { describeError } from "@/lib/trpc.js";
import { imageSrc } from "@/lib/images.js";
import { shrinkImage, uploadImage, type UploadKind } from "@/lib/upload.js";
import { ProductImage } from "@/components/ui/product-image.js";
import { Button, Input } from "@/components/ui/index.js";
import { useT } from "@/lib/i18n.js";

/**
 * Galerie administrable, partagée par les produits et les salles (SHOP-006,
 * ADMIN-007).
 *
 * L'ordre de la liste est celui du carrousel : la première image sert de
 * vignette, d'où les commandes de réorganisation. Les fichiers sont
 * téléversés immédiatement — l'URL renvoyée par le serveur est la seule
 * enregistrée, jamais le nom choisi par l'administrateur (SEC-005).
 */

interface ImagesFieldProps {
  images: string[];
  onChange: (images: string[]) => void;
  /** Dossier de destination côté serveur. */
  kind?: UploadKind;
  max?: number;
  label?: string;
  /** Phrase d'aide affichée sous la galerie, quand elle compte plusieurs images. */
  hint?: string;
}

export function ImagesField({
  images,
  onChange,
  kind = "products",
  max: maxImages,
  label: labelDonne,
  hint: hintDonne,
}: ImagesFieldProps) {
  const t = useT();
  const label = labelDonne ?? t("admin.images.productLabel");
  const hint = hintDonne ?? t("admin.images.productHint");
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const max = maxImages ?? LIMITS.imagesPerProduct;
  const full = images.length >= max;

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    // Les téléversements s'enchaînent au lieu de partir en parallèle : l'ordre
    // final correspond alors à l'ordre de sélection, et le serveur n'encaisse
    // pas six fichiers d'un coup.
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, max - images.length)) {
        const reduced = await shrinkImage(file, 1200);
        const result = await uploadImage(reduced, kind);
        uploaded.push(result.url);
      }
      if (files.length > max - images.length) {
        setError(t("admin.images.tooManySkipped", { max }));
      }
    } catch (caught) {
      // Les images déjà envoyées sont conservées : l'administrateur ne perd
      // pas le travail réussi à cause de la dernière qui a échoué.
      setError(describeError(caught).message);
    } finally {
      if (uploaded.length > 0) onChange([...images, ...uploaded]);
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function addUrl() {
    const trimmed = url.trim();
    if (trimmed === "") return;
    if (full) {
      setError(t("admin.images.max", { max }));
      return;
    }
    if (images.includes(trimmed)) {
      setError(t("admin.images.duplicate"));
      return;
    }
    setError(null);
    onChange([...images, trimmed]);
    setUrl("");
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-xs text-muted tabular-nums">
          {images.length}/{max}
        </span>
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((image, index) => (
            <li
              key={`${image}-${index}`}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-surface-raised"
            >
              <div className="flex aspect-square w-full items-center justify-center">
                <ProductImage
                  src={imageSrc(image)}
                  alt={t("admin.images.imageN", { n: index + 1 })}
                  className="size-full object-cover"
                />
              </div>

              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {t("admin.images.main")}
                </span>
              )}

              <button
                type="button"
                aria-label={t("admin.images.removeN", { n: index + 1 })}
                onClick={() => onChange(images.filter((_, at) => at !== index))}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-error"
              >
                <X className="size-3.5" aria-hidden />
              </button>

              <div className="flex border-t border-border/60 bg-black/40">
                <button
                  type="button"
                  aria-label={t("admin.images.leftN", { n: index + 1 })}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="flex flex-1 items-center justify-center py-1 text-white/80 hover:text-white disabled:opacity-25"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("admin.images.rightN", { n: index + 1 })}
                  disabled={index === images.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="flex flex-1 items-center justify-center py-1 text-white/80 hover:text-white disabled:opacity-25"
                >
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void onFilesSelected(event.target.files)}
      />

      <div className="flex gap-2">
        <Button
          variant="secondary"
          fullWidth
          icon={<ImagePlus className="size-4" aria-hidden />}
          loading={uploading}
          disabled={full}
          onClick={() => fileInput.current?.click()}
        >
          {full ? t("admin.images.full") : t("admin.images.add")}
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          inputMode="url"
          placeholder={t("admin.images.pasteUrl")}
          value={url}
          disabled={full}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addUrl();
            }
          }}
        />
        <Button
          variant="secondary"
          icon={<Link2 className="size-4" aria-hidden />}
          disabled={full || url.trim() === ""}
          onClick={addUrl}
        >
          {t("admin.images.addUrl")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      {images.length > 1 && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Galerie d'un produit du webshop. */
export function ProductImagesField(props: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  return (
    <ImagesField {...props} kind="products" max={LIMITS.imagesPerProduct} />
  );
}

/** Logo d'une association caritative : une seule image (SHOP-008). */
export function CharityImageField(props: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const t = useT();
  return (
    <ImagesField
      {...props}
      kind="charities"
      max={1}
      label={t("admin.images.charityLabel")}
      hint={t("admin.images.charityHint")}
    />
  );
}

/**
 * L'affiche d'un format de tournoi : une seule image (TOUR-006).
 *
 * Elle sert de tuile de filtre en tête du calendrier des clubs, dans un cadre
 * vertical — d'où le conseil de cadrage, qui évite de découvrir après coup que
 * le trophée était sur les bords.
 */
export function TournamentCoverField(props: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const t = useT();
  return (
    <ImagesField
      {...props}
      kind="tournaments"
      max={1}
      label={t("admin.images.coverLabel")}
      hint={t("admin.images.coverHint")}
    />
  );
}

/** Galerie d'une salle, affichée dans l'écran Informations. */
export function VenueImagesField(props: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const t = useT();
  return (
    <ImagesField
      {...props}
      kind="venues"
      max={LIMITS.imagesPerVenue}
      label={t("admin.images.venueLabel")}
      hint={t("admin.images.venueHint")}
    />
  );
}
