import { useEffect, useState } from "react";
import { ShoppingBag, type LucideIcon } from "lucide-react";
import { imageSrc } from "@/lib/images.js";

/**
 * Visuel de produit tolérant à la panne.
 *
 * Une URL d'image peut devenir injoignable après coup — hébergeur externe
 * hors ligne, appareil sans réseau, fichier supprimé du stockage. Le
 * navigateur affiche alors sa propre icône de lien brisé, et tout le
 * catalogue paraît cassé. Ici, l'échec retombe sur le pictogramme neutre déjà
 * utilisé pour un produit sans photo : la page reste lisible.
 */

interface ProductImageProps {
  src: string | undefined;
  alt: string;
  className?: string;
  iconClassName?: string;
  /**
   * Pictogramme de repli. Le sac de courses convient à un produit ; une
   * association ou une salle méritent le leur.
   */
  fallbackIcon?: LucideIcon;
  loading?: "eager" | "lazy";
}

export function ProductImage({
  src,
  alt,
  className,
  iconClassName,
  fallbackIcon: FallbackIcon = ShoppingBag,
  loading,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  /**
   * L'adresse enregistrée peut porter l'hôte d'une autre machine (IMG-001) :
   * elle est ramenée à l'origine courante avant d'être demandée.
   */
  const resolved = imageSrc(src);

  // Une nouvelle URL mérite une nouvelle tentative : sans cela, remplacer une
  // image cassée dans l'administration laisserait le pictogramme en place.
  useEffect(() => setFailed(false), [resolved]);

  if (!resolved || failed) {
    return (
      <FallbackIcon
        className={iconClassName ?? "size-8 text-muted"}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      loading={loading}
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
