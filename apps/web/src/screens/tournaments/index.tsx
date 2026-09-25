import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trophy,
} from "lucide-react";
import {
  TOURNAMENT_PROPOSAL_LEAD_DAYS,
  addDaysIso,
  diffDaysIso,
  type TournamentFormatView,
  type TournamentSummary,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { CompetitionsSwitch } from "@/components/competitions/switch.js";
import {
  PosterFigure,
  PosterFrame,
  TournamentStatusChip,
} from "@/components/competitions/poster.js";
import { imageSrc } from "@/lib/images.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { useT } from "@/lib/i18n.js";
import {
  monthLabel,
  monthMatrix,
  monthRange,
  weekdayInitials,
} from "@/lib/month.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { Button, EmptyState, SectionTitle } from "@/components/ui/index.js";
import { ProposeTournamentSheet } from "./propose.js";

/**
 * Le calendrier des tournois (TOUR-006).
 *
 * Bâti sur le même plan que celui de la ligue — grille mensuelle, filtres
 * envoyés au serveur, liste dessous — et c'est délibéré : un club qui sait
 * lire l'un sait lire l'autre. Ce qui change est ce qui doit changer.
 *
 * Le filtre principal n'est pas une liste déroulante mais trois affiches. Un
 * tournoi se choisit d'abord par son format — quatre clubs ce soir, ou seize
 * dans quinze jours —, et un format porte un nom, une taille, une dotation :
 * assez de matière pour une image, là où « Toutes les salles » n'en méritait
 * aucune.
 */
export function TournamentsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formatId, setFormatId] = useState<number | null>(null);
  const [proposing, setProposing] = useState(false);

  const mine = trpc.squads.mine.useQuery();
  const formats = trpc.tournaments.formats.useQuery();

  const range = useMemo(() => monthRange(cursor.year, cursor.month), [cursor]);

  const list = trpc.tournaments.list.useQuery({
    from: range.from,
    to: range.to,
    ...(formatId === null ? {} : { formatId }),
    mineOnly: false,
  });

  const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const tournament of list.data ?? []) {
      map.set(tournament.localDate, (map.get(tournament.localDate) ?? 0) + 1);
    }
    return map;
  }, [list.data]);

  const visible = useMemo(() => {
    const rows = list.data ?? [];
    return selectedDate
      ? rows.filter((row) => row.localDate === selectedDate)
      : rows;
  }, [list.data, selectedDate]);

  const role = mine.data?.squad?.viewer.role ?? null;
  const mayPropose = role === "founder" || role === "captain";
  const earliest = addDaysIso(today, TOURNAMENT_PROPOSAL_LEAD_DAYS);

  function shiftMonth(delta: number) {
    void tapFeedback();
    setSelectedDate(null);
    setCursor((current) => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  return (
    <Screen
      title={t("nav.competitions")}
      action={
        mayPropose ? (
          <button
            type="button"
            aria-label={t("tournament.propose")}
            onClick={() => {
              void tapFeedback("medium");
              setProposing(true);
            }}
            className="flex size-11 items-center justify-center rounded-full bg-accent text-background transition-transform active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        ) : undefined
      }
    >
      <CompetitionsSwitch />
      <p className="mb-4 text-sm leading-relaxed text-muted">
        {t("tournament.intro")}
      </p>

      <FormatFilter
        formats={formats.data ?? []}
        active={formatId}
        onPick={(id) => {
          void tapFeedback();
          setFormatId((current) => (current === id ? null : id));
        }}
      />

      {/* Navigation mensuelle */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label={t("tournament.previousMonth")}
          onClick={() => shiftMonth(-1)}
          className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            void tapFeedback();
            const now = new Date();
            setCursor({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
            setSelectedDate(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors hover:bg-surface-raised"
        >
          {monthLabel(cursor.year, cursor.month)}
        </button>
        <button
          type="button"
          aria-label={t("tournament.nextMonth")}
          onClick={() => shiftMonth(1)}
          className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {/* Grille du mois, du lundi au dimanche */}
      <div className="mb-4 rounded-card border border-border/60 bg-surface p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {weekdayInitials().map((day, index) => (
            <div
              key={`${day}-${index}`}
              className="py-1 text-center text-[10px] font-semibold uppercase text-muted"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} />;

            const count = countByDate.get(date) ?? 0;
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const isPast = diffDaysIso(today, date) < 0;

            return (
              <button
                key={date}
                type="button"
                onClick={() => {
                  void tapFeedback();
                  setSelectedDate(isSelected ? null : date);
                }}
                className={cn(
                  "relative flex aspect-square min-h-[40px] flex-col items-center justify-center rounded-lg text-sm transition-colors",
                  isSelected && "bg-accent font-bold text-background",
                  !isSelected &&
                    isToday &&
                    "ring-1 ring-accent text-accent font-semibold",
                  !isSelected && !isToday && isPast && "text-muted/40",
                  !isSelected &&
                    !isToday &&
                    !isPast &&
                    "text-foreground hover:bg-surface-raised",
                )}
                aria-label={
                  count > 0
                    ? t("tournament.dayTournaments", { date, count })
                    : date
                }
                aria-pressed={isSelected}
              >
                {Number(date.slice(-2))}
                {count > 0 && (
                  <span
                    className={cn(
                      "absolute bottom-1 size-1 rounded-full",
                      isSelected ? "bg-background" : "bg-accent",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <SectionTitle
        action={
          selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs font-medium text-accent"
            >
              {t("tournament.seeWholeMonth")}
            </button>
          )
        }
      >
        {selectedDate
          ? t("tournament.dayTitle", {
              date: selectedDate.split("-").reverse().join("/"),
            })
          : t("tournament.monthTitle")}
      </SectionTitle>

      <Async query={list} loadingLabel={t("tournament.loading")}>
        {() =>
          visible.length === 0 ? (
            <EmptyState
              title={t("tournament.emptyTitle")}
              description={
                mayPropose
                  ? t("tournament.emptyBodyMayPropose", {
                      date: earliest.split("-").reverse().join("/"),
                    })
                  : t("tournament.emptyBody")
              }
              icon={<CalendarDays className="size-6" aria-hidden />}
              action={
                mayPropose ? (
                  <Button variant="accent" onClick={() => setProposing(true)}>
                    {t("tournament.propose")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-2">
              {visible.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))}
            </div>
          )
        }
      </Async>

      {proposing && (
        <ProposeTournamentSheet
          initialDate={selectedDate ?? earliest}
          initialFormatId={formatId}
          onClose={() => setProposing(false)}
          onCreated={(tournamentId) => {
            setProposing(false);
            navigate(`/tournois/${tournamentId}`);
          }}
        />
      )}
    </Screen>
  );
}

/**
 * Les trois affiches, qui sont aussi le filtre.
 *
 * Une tuile pressée filtre le mois ; pressée de nouveau, elle le rouvre. Pas
 * de tuile « Tous » : elle aurait occupé un quart de la rangée pour dire ce
 * que l'absence de sélection dit déjà.
 */
function FormatFilter({
  formats,
  active,
  onPick,
}: {
  formats: TournamentFormatView[];
  active: number | null;
  onPick: (formatId: number) => void;
}) {
  const t = useT();
  if (formats.length === 0) return null;

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      {formats.map((format) => {
        const cover = imageSrc(format.coverImageUrl);
        const isActive = active === format.id;

        return (
          <button
            key={format.id}
            type="button"
            onClick={() => onPick(format.id)}
            aria-pressed={isActive}
            className={cn(
              "relative aspect-[3/4] overflow-hidden rounded-card border text-left transition-transform active:scale-[0.97]",
              isActive
                ? "border-accent ring-2 ring-accent"
                : "border-border/60 hover:border-border",
            )}
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              /* Sans affiche, une tuile pleine plutôt qu'un cadre vide : le
                 format reste choisissable, c'est tout ce qui compte ici. */
              <div className="absolute inset-0 bg-surface-raised" />
            )}

            {/* Le voile n'est pas décoratif : sans lui, un nom blanc sur une
                photo claire devient illisible, et on ne choisit pas l'image. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />

            <div className="absolute inset-x-0 bottom-0 p-2">
              <p className="font-display text-[15px] font-extrabold uppercase leading-none text-white">
                {format.name}
              </p>
              <p className="mt-1 text-[10px] text-white/70">
                {t("tournament.clubsCount", { count: format.size })}
                {format.openCount > 0 &&
                  ` · ${t(
                    format.openCount > 1
                      ? "tournament.openMany"
                      : "tournament.openOne",
                    { count: format.openCount },
                  )}`}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Un tournoi en affiche.
 *
 * Trois chiffres, et pas un de plus : les places, ce que coûte l'engagement,
 * ce que rapporte la victoire. Le compte des engagés passe en premier — un
 * plateau qui se remplit ferme la porte, et l'afficher après coup n'aurait
 * servi à personne.
 */
export function TournamentCard({
  tournament,
}: {
  tournament: TournamentSummary;
}) {
  const t = useT();
  const navigate = useNavigate();
  const full = tournament.entryCount >= tournament.size;

  return (
    <button
      type="button"
      onClick={() => {
        void tapFeedback();
        navigate(`/tournois/${tournament.id}`);
      }}
      className="block w-full text-left transition-transform active:scale-[0.99]"
    >
      <PosterFrame>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <TournamentStatusChip status={tournament.status} />
          {tournament.viewer.isRegistered && !tournament.winner && (
            <span className="text-[12px] font-semibold text-emerald-300">
              {t("tournament.yourClubIn")}
            </span>
          )}
        </span>

        <span className="mt-3 block font-display text-[30px] font-extrabold uppercase italic leading-[0.95]">
          {tournament.name}
        </span>
        <span className="mt-2 block text-[13px] text-slate-300">
          {formatLongDate(tournament.localDate)} · {tournament.localTimeLabel} ·{" "}
          {tournament.venueName}
        </span>

        <span className="mt-3.5 grid grid-cols-3 gap-2">
          <PosterFigure
            label={t("tournament.clubs")}
            value={
              <>
                {tournament.entryCount}
                <span className="text-muted/70">/{tournament.size}</span>
              </>
            }
            warn={full}
          />
          <PosterFigure
            label={t("tournament.entryFee")}
            value={tournament.entryFeeUno > 0 ? tournament.entryFeeUno : "—"}
          />
          <PosterFigure
            label={t("tournament.prize")}
            value={tournament.prizeUno > 0 ? tournament.prizeUno : "—"}
            highlight
          />
        </span>

        {tournament.winner && (
          <span className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-orange-300">
            <Trophy className="size-4 text-accent" aria-hidden />
            {t("tournament.winnerIs", { name: tournament.winner.name })}
          </span>
        )}
      </PosterFrame>
    </button>
  );
}
