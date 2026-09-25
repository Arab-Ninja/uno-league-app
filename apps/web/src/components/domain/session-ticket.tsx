import { CheckCircle2, MapPin } from "lucide-react";
import {
  getGameMode,
  type GameModeId,
  type ProposalSummary,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { Badge, ProgressBar } from "@/components/ui/index.js";
import { DivisionBadge, ProposalStatusBadge } from "./index.js";

/**
 * Le code couleur des modes, porté par le liseré gauche du billet.
 *
 * Une couleur par famille, pas par mode : l'orange pour la ligue (ce qui se
 * gagne), le bleu pour les rencontres amicales et les compétitions de clubs,
 * le vert pour le football sur gazon.
 */
const MODE_TONE: Record<GameModeId, { stripe: string; label: string }> = {
  league: { stripe: "bg-accent", label: "text-orange-300" },
  friendly: { stripe: "bg-electric", label: "text-blue-300" },
  squad: { stripe: "bg-flood", label: "text-flood" },
  tournaments: { stripe: "bg-flood", label: "text-flood" },
  bigfoot: { stripe: "bg-success", label: "text-emerald-300" },
  minigames: { stripe: "bg-warning", label: "text-amber-300" },
  training: { stripe: "bg-warning", label: "text-amber-300" },
};

/** « 18:00 - 20:00 » → ["18:00", "20:00"] ; un libellé inattendu reste entier. */
function splitTimeLabel(label: string): [string, string | null] {
  const parts = label.split(/\s*[-–]\s*/);
  return parts.length === 2 ? [parts[0]!, parts[1]!] : [label, null];
}

/**
 * Les places d'une séance, un segment par joueur.
 *
 * Au-delà de seize places, les segments deviendraient des traits illisibles :
 * on revient alors à une jauge continue.
 */
export function SlotsBar({
  filled,
  total,
  label,
}: {
  filled: number;
  total: number;
  label: string;
}) {
  if (total > 16 || total <= 0) {
    return (
      <ProgressBar value={filled} max={total} tone="accent" label={label} />
    );
  }
  return (
    <div
      role="progressbar"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={label}
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full",
            index < filled ? "bg-accent" : "bg-surface-raised",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Une séance en billet de match (calendrier).
 *
 * Toute la carte ouvre la séance : c'est là que l'on réserve, paie ou se
 * désiste. Le billet ne porte donc qu'un appel, dans sa souche, pour dire ce
 * qui attend le joueur de l'autre côté.
 */
export function SessionTicket({
  proposal,
  onOpen,
}: {
  proposal: ProposalSummary;
  onOpen: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const mode = getGameMode(proposal.modeId);
  const modeName = mode ? L.gameMode[mode.id] : proposal.modeId;
  const tone = MODE_TONE[proposal.modeId] ?? MODE_TONE.friendly;
  const [start, end] = splitTimeLabel(proposal.localTimeLabel);
  const playing = proposal.viewer?.isParticipant ?? false;
  const paid = proposal.viewer?.hasPaid ?? false;
  const shown = Math.min(proposal.participantCount, proposal.minParticipants);
  const substitutes = proposal.participantCount - proposal.minParticipants;

  return (
    <button
      type="button"
      onClick={() => {
        void tapFeedback();
        onOpen();
      }}
      aria-label={t("session.label", {
        mode: modeName,
        date: proposal.localDate,
      })}
      className={cn(
        "relative block w-full overflow-hidden rounded-[20px] border bg-surface text-left transition-all active:scale-[0.99] active:opacity-80",
        playing && paid ? "border-success/35" : "border-border",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", tone.stripe)}
      />

      <span className="block px-4 pb-3.5 pl-5 pt-4">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate text-[12px] font-bold uppercase tracking-[0.14em]",
                tone.label,
              )}
            >
              {modeName}
            </span>
            <span className="mt-0.5 block font-display text-[34px] font-extrabold italic leading-none tabular-nums">
              {start}
              {end && (
                <span className="text-[20px] text-muted/70"> → {end}</span>
              )}
            </span>
          </span>
          {playing ? (
            paid ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" aria-hidden />
                {t("home.playing")}
              </Badge>
            ) : (
              <Badge tone="warning">{t("calendar.toPay")}</Badge>
            )
          ) : (
            <ProposalStatusBadge status={proposal.status} />
          )}
        </span>

        <span className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-muted" aria-hidden />
            {proposal.venueName}
          </span>
          <DivisionBadge division={proposal.division} />
        </span>

        <span className="mt-3.5 flex items-center gap-2.5">
          <span className="min-w-0 flex-1">
            <SlotsBar
              filled={proposal.participantCount}
              total={proposal.minParticipants}
              label={t("session.progress")}
            />
          </span>
          <span className="shrink-0 font-display text-[16px] font-bold tabular-nums">
            {shown}/{proposal.minParticipants}
          </span>
        </span>
        {substitutes > 0 && (
          <span className="mt-1.5 block text-[12px] text-muted">
            {t(
              substitutes > 1
                ? "session.substitutesPlural"
                : "session.substitutes",
              { count: substitutes },
            )}
          </span>
        )}
      </span>

      {/* La souche : prix ou statut du joueur, et ce qu'il trouvera en ouvrant */}
      <span className="relative flex items-center justify-between border-t border-dashed border-flood/20 px-4 py-3 pl-5">
        <span
          aria-hidden
          className="absolute -left-[9px] -top-[9px] size-[18px] rounded-full bg-background"
        />
        <span
          aria-hidden
          className="absolute -right-[9px] -top-[9px] size-[18px] rounded-full bg-background"
        />
        <span className="text-[13px] text-muted">
          {paid ? (
            <span className="font-semibold text-success">
              {t("session.paid")}
            </span>
          ) : (
            <>
              <span className="font-display text-[17px] font-extrabold text-foreground">
                {proposal.priceUno}
              </span>{" "}
              UNO
            </>
          )}
        </span>
        <span
          className={cn(
            "text-[13px] font-bold uppercase tracking-[0.08em]",
            playing ? "text-foreground" : "text-accent",
          )}
        >
          {playing
            ? paid
              ? t("home.open")
              : t("home.pay")
            : proposal.participantCount >= proposal.minParticipants
              ? t("home.open")
              : t("home.book")}
        </span>
      </span>
    </button>
  );
}
