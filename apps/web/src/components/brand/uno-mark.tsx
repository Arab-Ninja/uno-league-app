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
          <g fill="#000">
            <g transform="translate(5.82 9.31) scale(0.8056)">
              <path d="M32 45 C21 41 18.5 31 25 22.5 C25.8 27 28 28 29.2 26 C30.8 20 27.5 15.5 30 9 C35 15 40.5 18.5 41 26.5 C42.5 23.5 43 21.5 43.2 19 C46.5 26 46 38 32 45 Z" />
            </g>
          </g>
          <circle cx="32" cy="38.0" r="10.5" fill="#000" />
          <path
            d="M32.00 32.33 37.39 36.25 35.33 42.59 28.67 42.59 26.61 36.25Z"
            fill="#fff"
          />
          <g stroke="#fff" strokeWidth="2.73" strokeLinecap="round">
            <path d="M32.00 32.33 32.00 27.50" />
            <path d="M37.39 36.25 41.99 34.76" />
            <path d="M35.33 42.59 38.17 46.49" />
            <path d="M28.67 42.59 25.83 46.49" />
            <path d="M26.61 36.25 22.01 34.76" />
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
      <g fill="#0F172A">
        <g transform="translate(5.82 9.31) scale(0.8056)">
          <path d="M32 45 C21 41 18.5 31 25 22.5 C25.8 27 28 28 29.2 26 C30.8 20 27.5 15.5 30 9 C35 15 40.5 18.5 41 26.5 C42.5 23.5 43 21.5 43.2 19 C46.5 26 46 38 32 45 Z" />
        </g>
      </g>
      <circle cx="32" cy="38.0" r="10.5" fill="#0F172A" />
      <path
        d="M32.00 32.33 37.39 36.25 35.33 42.59 28.67 42.59 26.61 36.25Z"
        fill="#F97316"
      />
      <g stroke="#F97316" strokeWidth="2.73" strokeLinecap="round">
        <path d="M32.00 32.33 32.00 27.50" />
        <path d="M37.39 36.25 41.99 34.76" />
        <path d="M35.33 42.59 38.17 46.49" />
        <path d="M28.67 42.59 25.83 46.49" />
        <path d="M26.61 36.25 22.01 34.76" />
      </g>
    </svg>
  );
}
