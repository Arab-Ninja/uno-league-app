import { cn } from "@/lib/cn.js";
import { initials } from "@/lib/format.js";
import { imageSrc } from "@/lib/images.js";

/**
 * L'écusson d'un club.
 *
 * Le club qui a choisi une image la voit ; les autres reçoivent un blason
 * dessiné à leurs initiales. Un rond gris avec deux lettres aurait fait
 * l'affaire, mais un club n'est pas un joueur : le blason dit « équipe » avant
 * même qu'on lise le nom.
 */
export function ClubCrest({
  name,
  url,
  size = 76,
  className,
}: {
  name: string;
  url?: string | null;
  /** Largeur en pixels ; la hauteur suit la forme du blason. */
  size?: number;
  className?: string;
}) {
  const height = Math.round(size * (88 / 78));

  if (url) {
    return (
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-2xl border-2 border-accent bg-surface",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={imageSrc(url)}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 78 88"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M39 2 74 12v30c0 22-15 36-35 44C19 78 4 64 4 42V12z"
        fill="#0b1122"
        stroke="var(--color-accent)"
        strokeWidth="3"
      />
      <path
        d="M39 12 64 19v23c0 16-10 26-25 32-15-6-25-16-25-32V19z"
        fill="#16264d"
      />
      <text
        x="39"
        y="54"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontStyle="italic"
        fontSize="26"
        fill="var(--color-foreground)"
      >
        {initials(name)}
      </text>
    </svg>
  );
}
