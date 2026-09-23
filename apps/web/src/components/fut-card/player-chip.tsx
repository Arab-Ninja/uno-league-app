import type { PublicPlayer } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { FutCard } from "./fut-card.js";
import { useT } from "@/lib/i18n.js";

/**
 * Un joueur dans une liste : sa carte en vignette, son nom, et de quoi
 * l'ouvrir en grand.
 *
 * Le même geste partout — effectif d'un SQUAD, composition d'un défi, marché
 * des transferts. Quatre écrans répétaient un bloc « photo ronde + nom » ;
 * c'était trois occasions de diverger, et la carte y était introuvable alors
 * qu'elle est ce que le joueur veut voir.
 *
 * `animated={false}` : l'animation de révélation a du sens sur une carte
 * qu'on ouvre, pas sur dix vignettes qui s'affichent d'un coup.
 */
export function PlayerChip({
  player,
  onOpen,
  subtitle,
  trailing,
  className,
}: {
  player: PublicPlayer;
  /** Ouvre la carte en grand ; absent, la vignette n'est pas cliquable. */
  onOpen?: (player: PublicPlayer) => void;
  subtitle?: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const clickable = onOpen !== undefined;

  const body = (
    <>
      <FutCard player={player} size="xs" animated={false} />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{player.displayName}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {subtitle ??
            `${player.division ?? t("accountType.referee")} · ${t("a11y.cardRating", { rating: player.rating })}`}
        </p>
      </div>
    </>
  );

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {clickable ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-70"
          onClick={() => {
            void tapFeedback();
            onOpen(player);
          }}
          aria-label={t("a11y.seeCardOf", { name: player.displayName })}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{body}</div>
      )}
      {trailing}
    </div>
  );
}
