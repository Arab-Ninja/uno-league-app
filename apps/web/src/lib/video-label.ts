import { useCallback } from "react";
import { useT } from "@/lib/i18n.js";

/**
 * Le nom affiché d'un enregistrement (TRACK-001).
 *
 * Sans nom donné, la saisie nommait ses enregistrements « Enregistrement 1 »,
 * « Enregistrement 2 » ; ce sont en réalité les angles d'un même terrain. Le
 * nom par défaut est désormais « Angle 1 », « Angle 2 », et les anciens noms
 * par défaut s'affichent de la même façon, dans la langue de l'écran.
 */
const DEFAULT_LABEL = /^(?:Enregistrement|Recording|Opname|Angle|Hoek) (\d+)$/;

export function useRecordingLabel(): (label: string | null) => string | null {
  const t = useT();
  return useCallback(
    (label: string | null) => {
      const n = label ? DEFAULT_LABEL.exec(label.trim())?.[1] : undefined;
      return n ? t("videos.angleN", { n }) : label;
    },
    [t],
  );
}
