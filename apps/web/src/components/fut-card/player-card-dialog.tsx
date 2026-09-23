import { useEffect } from "react";
import { X } from "lucide-react";
import type { PublicPlayer } from "@uno/shared";
import { FutCard } from "./fut-card.js";
import { useLibelles, useT } from "@/lib/i18n.js";

/**
 * Affiche une carte en grand format.
 * Utilisée depuis les listes, où les cartes sont réduites : un appui donne
 * accès au détail sans quitter l'écran.
 */
export function PlayerCardDialog({
  player,
  onClose,
}: {
  player: PublicPlayer;
  onClose: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/80 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("a11y.cardOf", { name: player.displayName })}
      onClick={onClose}
    >
      <div
        className="animate-rise"
        onClick={(event) => event.stopPropagation()}
      >
        <FutCard player={player} size="lg" animated />
      </div>

      <div className="text-center" onClick={(event) => event.stopPropagation()}>
        <p className="text-base font-semibold">{player.displayName}</p>
        <p className="mt-0.5 text-xs text-muted">
          {/* Un arbitre n'a pas de division (ROLE-003) : la mention saute
              plutôt que de laisser « Division · » en suspens. */}
          {[
            player.accountType === "referee"
              ? t("accountType.referee")
              : L.position[player.position],
            ...(player.division
              ? [t("a11y.cardDivision", { division: player.division })]
              : []),
            t("a11y.cardLevel", { level: player.level }),
          ].join(" · ")}
        </p>
      </div>

      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="flex size-12 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-foreground active:opacity-70"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}
