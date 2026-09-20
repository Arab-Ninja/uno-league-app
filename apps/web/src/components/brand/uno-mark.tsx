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
        <mask id="uno-ballon"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="30" r="13" fill="#000"/><path d="M32.00 22.98 38.68 27.83 36.13 35.68 27.87 35.68 25.32 27.83Z" fill="#fff"/><g stroke="#fff" strokeWidth="2.02" strokeLinecap="round"><path d="M32.00 22.98 32.00 17.00"/><path d="M38.68 27.83 44.36 25.98"/><path d="M36.13 35.68 39.64 40.52"/><path d="M27.87 35.68 24.36 40.52"/><path d="M25.32 27.83 19.64 25.98"/></g></mask><path d="M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z" fill="currentColor" mask="url(#uno-ballon)"/>
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
      <path d="M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z" fill="#0F172A" stroke="#F97316" strokeWidth="3.5" strokeLinejoin="round"/><circle cx="32.0" cy="30.0" r="13.0" fill="#fff"/><path d="M32.00 22.98 38.68 27.83 36.13 35.68 27.87 35.68 25.32 27.83Z" fill="#F97316"/><g stroke="#0F172A" strokeWidth="2.02" strokeLinecap="round"><path d="M32.00 22.98 32.00 17.00"/><path d="M38.68 27.83 44.36 25.98"/><path d="M36.13 35.68 39.64 40.52"/><path d="M27.87 35.68 24.36 40.52"/><path d="M25.32 27.83 19.64 25.98"/></g>
    </svg>
  );
}
