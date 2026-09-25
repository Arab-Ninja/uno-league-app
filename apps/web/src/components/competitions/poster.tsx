import type { ReactNode } from "react";
import type { TournamentSummary } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { useLibelles } from "@/lib/i18n.js";

/**
 * L'affiche d'un tournoi : le fond bleu nuit, le projecteur dans le coin.
 *
 * Partagée par la liste et la fiche, pour qu'un tournoi ait le même visage
 * des deux côtés : on reconnaît l'affiche qu'on vient de toucher.
 */
export function PosterFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded-[22px] border border-electric/35 bg-[linear-gradient(165deg,#1d3b7a_0%,#0e1b3b_45%,#070b16_100%)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-80"
        style={{
          background:
            "radial-gradient(circle, rgb(207 224 255 / 0.28) 0%, transparent 62%)",
        }}
      />
      <span className="relative block p-4">{children}</span>
    </span>
  );
}

/** La couleur de la pastille d'état, du plus pressant au plus calme. */
const STATUS_TONE: Record<TournamentSummary["status"], string> = {
  open: "bg-success/15 text-emerald-300",
  drawn: "bg-electric/20 text-blue-200",
  completed: "bg-accent/15 text-orange-300",
  cancelled: "bg-flood/10 text-muted",
};

export function TournamentStatusChip({
  status,
}: {
  status: TournamentSummary["status"];
}) {
  const L = useLibelles();
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em]",
        STATUS_TONE[status],
      )}
    >
      {L.tournamentStatus[status]}
    </span>
  );
}

/** Un chiffre de l'affiche : les places, l'engagement, la dotation. */
export function PosterFigure({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={cn(
        "block rounded-xl p-2.5",
        highlight ? "border border-accent/30 bg-accent/15" : "bg-background/50",
      )}
    >
      <span
        className={cn(
          "block font-display text-[22px] font-extrabold leading-none tabular-nums",
          highlight && "text-orange-400",
          warn && "text-warning",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.12em]",
          highlight ? "text-orange-200" : "text-muted",
        )}
      >
        {label}
      </span>
    </span>
  );
}
