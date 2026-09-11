import { useState } from "react";
import { countryName } from "@/lib/countries.js";
import { cn } from "@/lib/cn.js";

/**
 * Drapeau national.
 *
 * Les emoji drapeaux ne sont pas rendus sous Windows : le système affiche les
 * deux lettres du code pays à la place (« BE » au lieu du drapeau belge). Les
 * images sont donc servies par l'application, ce qui garantit un rendu
 * identique sur tous les systèmes et fonctionne hors ligne dans
 * l'application empaquetée.
 *
 * Un code sans image n'affiche pas l'icône de fichier cassé : la liste des
 * nationalités proposées peut changer, alors que les profils déjà
 * enregistrés, eux, gardent le code choisi le jour de l'inscription.
 */
export function Flag({
  countryCode,
  className,
}: {
  countryCode: string;
  className?: string;
}) {
  const [missing, setMissing] = useState(false);
  const code = countryCode.toLowerCase();
  const name = countryName(countryCode);

  if (!/^[a-z]{2}$/.test(code) || missing) {
    return <span className={className} aria-hidden />;
  }

  return (
    <img
      src={`/flags/${code}.svg`}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setMissing(true)}
      // Ratio 4:3 comme les drapeaux de la source ; la bordure détache les
      // drapeaux très clairs d'un fond lui aussi clair.
      className={cn(
        "inline-block h-[1em] w-[1.34em] rounded-[2px] object-cover align-[-0.12em]",
        "ring-1 ring-black/15",
        className,
      )}
    />
  );
}
