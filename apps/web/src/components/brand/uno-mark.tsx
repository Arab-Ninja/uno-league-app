import { cn } from "@/lib/cn.js";

/**
 * L'écusson UNO League.
 *
 * **Inline plutôt qu'une balise `img`**, pour deux raisons : la marque
 * apparaît dès le premier écran, et une image chargée après coup y fait un
 * trou le temps qu'elle arrive ; et la version monochrome hérite de la
 * couleur du texte, ce qu'un `img` ne sait pas faire.
 *
 * Le fichier de référence est `docs/branding/mark.svg` — celui-ci en est la
 * transcription. Les deux doivent bouger ensemble.
 */
export function UnoMark({
  className,
  mono = false,
}: {
  className?: string;
  /**
   * Une seule encre, prise sur la couleur du texte. Le U est alors évidé
   * plutôt que posé : deux formes de la même couleur, l'une sur l'autre, ne
   * feraient qu'une tache.
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
        <mask id="uno-mark-u">
          <rect width="64" height="64" fill="#fff" />
          <path
            d="M21 18v14a11 11 0 0 0 22 0V18"
            fill="none"
            stroke="#000"
            strokeWidth="7.5"
            strokeLinecap="round"
          />
        </mask>
        <path
          d="M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z"
          fill="currentColor"
          mask="url(#uno-mark-u)"
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
        fill="#0F172A"
        stroke="#F97316"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M21 18v14a11 11 0 0 0 22 0V18"
        fill="none"
        stroke="#fff"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
