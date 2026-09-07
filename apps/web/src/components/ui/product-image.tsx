import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";

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
  loading?: "eager" | "lazy";
}

export function ProductImage({
  src,
  alt,
  className,
  iconClassName,
  loading,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  // Une nouvelle URL mérite une nouvelle tentative : sans cela, remplacer une
  // image cassée dans l'administration laisserait le pictogramme en place.
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <ShoppingBag
        className={iconClassName ?? "size-8 text-muted"}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
