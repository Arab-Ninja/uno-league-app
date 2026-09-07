import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { ProductImage } from "./product-image.js";

/**
 * Carrousel d'images produit (SHOP-002).
 *
 * Le défilement natif du navigateur fait tout le travail : chaque image est un
 * point d'ancrage (`scroll-snap`), ce qui donne gratuitement le glissement au
 * doigt, l'inertie et le respect des préférences système. Les flèches et les
 * pastilles ne font que piloter ce même défilement, si bien qu'il n'existe
 * qu'une seule source de vérité — la position réelle du conteneur.
 */

interface ImageCarouselProps {
  images: readonly string[];
  alt: string;
  className?: string;
}

export function ImageCarousel({ images, alt, className }: ImageCarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // La position affichée suit le défilement réel plutôt que les clics : un
  // glissement au doigt met donc les pastilles à jour comme les flèches.
  useEffect(() => {
    const element = track.current;
    if (!element) return;

    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!element) return;
        const width = element.clientWidth;
        if (width === 0) return;
        setIndex(Math.round(element.scrollLeft / width));
      });
    }

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", onScroll);
    };
  }, []);

  function goTo(next: number) {
    const element = track.current;
    if (!element) return;
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    element.scrollTo({ left: clamped * element.clientWidth, behavior: "smooth" });
    // Retour visuel immédiat : le défilement animé mettra ensuite à jour
    // l'état une seconde fois, avec la même valeur.
    setIndex(clamped);
  }

  if (images.length === 0) {
    return (
      <div
        className={`flex aspect-square items-center justify-center rounded-card border border-border/60 bg-surface-raised ${className ?? ""}`}
      >
        <ShoppingBag className="size-12 text-muted" aria-hidden />
      </div>
    );
  }

  const single = images.length === 1;

  return (
    <div
      className={`relative overflow-hidden rounded-card border border-border/60 bg-surface-raised ${className ?? ""}`}
    >
      <div
        ref={track}
        role="group"
        aria-roledescription="carrousel"
        aria-label={`Images de ${alt}`}
        tabIndex={single ? -1 : 0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(index - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo(index + 1);
          }
        }}
        className={`flex snap-x snap-mandatory overflow-x-auto scroll-smooth outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          single ? "overflow-x-hidden" : ""
        }`}
      >
        {images.map((src, position) => (
          <div
            key={`${src}-${position}`}
            className="flex aspect-square w-full shrink-0 items-center justify-center snap-center"
            role="group"
            aria-roledescription="diapositive"
            aria-label={`Image ${position + 1} sur ${images.length}`}
          >
            <ProductImage
              src={src}
              alt={images.length > 1 ? `${alt} — vue ${position + 1}` : alt}
              className="size-full object-cover"
              iconClassName="size-12 text-muted"
              loading={position === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {!single && (
        <>
          <CarouselArrow
            side="left"
            label="Image précédente"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
          />
          <CarouselArrow
            side="right"
            label="Image suivante"
            disabled={index === images.length - 1}
            onClick={() => goTo(index + 1)}
          />

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {images.map((src, position) => (
              <button
                key={`dot-${src}-${position}`}
                type="button"
                aria-label={`Aller à l'image ${position + 1}`}
                aria-current={position === index}
                onClick={() => goTo(position)}
                className={`size-2 rounded-full ring-1 ring-black/40 transition-colors ${
                  position === index ? "bg-accent" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CarouselArrow({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/60 disabled:pointer-events-none disabled:opacity-0 ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
