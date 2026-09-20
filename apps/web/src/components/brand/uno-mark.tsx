import { cn } from "@/lib/cn.js";

/**
 * L'écusson UNO League : un ballon logé dans l'écusson d'une ligue.
 *
 * **Inline plutôt qu'une balise `img`**, pour deux raisons : la marque
 * apparaît dès le premier écran, et une image chargée après coup y fait un
 * trou le temps qu'elle arrive ; et la version monochrome hérite de la
 * couleur du texte, ce qu'un `img` ne sait pas faire.
 *
 * Fichier engendré par `docs/branding/genere.py` — ne pas le retoucher à la
 * main : le prochain passage du script effacerait la retouche.
 */
export function UnoMark({
  className,
  mono = false,
}: {
  className?: string;
  /**
   * Une seule encre, prise sur la couleur du texte. Le ballon est alors
   * évidé plutôt que posé : deux formes de la même couleur, l'une sur
   * l'autre, ne feraient qu'une tache.
   */
  mono?: boolean;
}) {
  if (mono) {
    return (
      <svg
        viewBox="0 0 64 64"
        className={cn("block", className)}
        role="img"
        aria-label="UNO League"
      >
        <mask id="uno-ballon">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="32" cy="29.0" r="13.5" fill="#000" />
          <path
            d="M32.00 21.71 38.93 26.75 36.28 34.90 27.72 34.90 25.07 26.75Z"
            fill="#fff"
          />
          <g stroke="#fff" strokeWidth="3.51" strokeLinecap="round">
            <path d="M32.00 21.71 32.00 15.50" />
            <path d="M38.93 26.75 44.84 24.83" />
            <path d="M36.28 34.90 39.94 39.92" />
            <path d="M27.72 34.90 24.06 39.92" />
            <path d="M25.07 26.75 19.16 24.83" />
          </g>
        </mask>
        <path
          d="M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z"
          fill="currentColor"
          mask="url(#uno-ballon)"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("block", className)}
      role="img"
      aria-label="UNO League"
    >
      <path
        d="M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z"
        fill="#F97316"
      />
      <circle cx="32" cy="29.0" r="13.5" fill="#0F172A" />
      <path
        d="M32.00 21.71 38.93 26.75 36.28 34.90 27.72 34.90 25.07 26.75Z"
        fill="#F97316"
      />
      <g stroke="#F97316" strokeWidth="3.51" strokeLinecap="round">
        <path d="M32.00 21.71 32.00 15.50" />
        <path d="M38.93 26.75 44.84 24.83" />
        <path d="M36.28 34.90 39.94 39.92" />
        <path d="M27.72 34.90 24.06 39.92" />
        <path d="M25.07 26.75 19.16 24.83" />
      </g>
    </svg>
  );
}
