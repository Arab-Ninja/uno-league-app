import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import {
  MIN_PROPOSAL_LEAD_DAYS,
  addDaysIso,
  diffDaysIso,
  type ProposalStatus,
  type SchedulableModeId,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import {
  formatDayNumber,
  formatLongDate,
  formatMonth,
  formatWeekdayShort,
  todayIso,
} from "@/lib/format.js";
import { useNomDeMode, useT, type Cle } from "@/lib/i18n.js";
import { cn } from "@/lib/cn.js";
import { monthMatrix, monthRange, weekdayInitials } from "@/lib/month.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SessionTicket } from "@/components/domain/session-ticket.js";
import { Async } from "@/components/ui/async.js";
import { Button, EmptyState, SectionTitle } from "@/components/ui/index.js";
import { PaymentReturn } from "@/components/payment-return.js";
import { CreateProposalSheet } from "./create-proposal.js";

/**
 * Calendrier (CAL-001, CAL-002).
 *
 * Deux vues : la semaine, par défaut — c'est l'horizon d'un joueur qui
 * cherche un match —, et le mois, en grille du lundi au dimanche. Les filtres
 * de lieu, de mode et de statut sont envoyés au serveur : le client ne filtre
 * jamais lui-même une liste tronquée.
 */

/** Le lundi de la semaine d'une date ISO. */
function mondayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysIso(isoDate, -((day + 6) % 7));
}

const STATUS_TABS: { id: ProposalStatus | "all"; cle: Cle }[] = [
  { id: "all", cle: "calendar.all" },
  { id: "proposal", cle: "calendar.proposals" },
  { id: "reservation", cle: "calendar.reservations" },
  { id: "session", cle: "calendar.sessions" },
];

export function CalendarScreen() {
  const t = useT();
  const nomDeMode = useNomDeMode();
  const navigate = useNavigate();
  const today = todayIso();

  const [view, setView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso()));
  const [showFilters, setShowFilters] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string>("");
  const [modeId, setModeId] = useState<string>("");
  const [status, setStatus] = useState<ProposalStatus | "all">("all");
  const [creating, setCreating] = useState(false);

  const config = trpc.proposals.config.useQuery();

  const range = useMemo(
    () =>
      view === "week"
        ? { from: weekStart, to: addDaysIso(weekStart, 6) }
        : monthRange(cursor.year, cursor.month),
    [view, weekStart, cursor],
  );

  const proposals = trpc.proposals.list.useQuery({
    from: range.from,
    to: range.to,
    ...(venueId ? { venueId } : {}),
    ...(modeId ? { modeId: modeId as SchedulableModeId } : {}),
    ...(status !== "all" ? { status } : {}),
    mineOnly: false,
  });

  const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const proposal of proposals.data ?? []) {
      map.set(proposal.localDate, (map.get(proposal.localDate) ?? 0) + 1);
    }
    return map;
  }, [proposals.data]);

  const visible = useMemo(() => {
    const list = proposals.data ?? [];
    if (selectedDate) {
      return list.filter((proposal) => proposal.localDate === selectedDate);
    }
    /*
     * Sans jour choisi, la liste couvre le mois entier — passé compris. Telle
     * quelle, la première carte qu'on voit un 20 du mois est celle du 3, déjà
     * jouée et complète : l'écran s'ouvre sur ce qu'on ne peut plus faire.
     *
     * Les séances à venir passent donc devant, de la plus proche à la plus
     * lointaine ; les passées suivent, de la plus récente à la plus ancienne.
     * Rien n'est masqué : un mois reste un mois.
     */
    const aVenir = list.filter((proposal) => proposal.localDate >= today);
    const passees = list.filter((proposal) => proposal.localDate < today);
    aVenir.sort((a, b) => a.localDate.localeCompare(b.localDate));
    passees.sort((a, b) => b.localDate.localeCompare(a.localDate));
    return [...aVenir, ...passees];
  }, [proposals.data, selectedDate, today]);

  // L'intitulé suit la vue : en semaine, le mois de son jeudi — la
  // convention des semaines ISO, qui tranche les semaines à cheval.
  const weekMonth = addDaysIso(weekStart, 3);
  const monthLabel =
    view === "week"
      ? formatMonth(
          Number(weekMonth.slice(0, 4)),
          Number(weekMonth.slice(5, 7)) - 1,
        )
      : formatMonth(cursor.year, cursor.month);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDaysIso(weekStart, index),
  );

  /** Les séances visibles, regroupées par jour, dans l'ordre de la liste. */
  const groups = useMemo(() => {
    const byDate = new Map<string, typeof visible>();
    for (const proposal of visible) {
      const list = byDate.get(proposal.localDate) ?? [];
      list.push(proposal);
      byDate.set(proposal.localDate, list);
    }
    return [...byDate.entries()];
  }, [visible]);

  function dayHeading(date: string): string {
    const delta = diffDaysIso(today, date);
    if (delta === 0) return t("home.today");
    if (delta === 1) return t("home.tomorrow");
    return formatLongDate(date);
  }

  function shift(delta: number) {
    if (view === "month") {
      shiftMonth(delta);
      return;
    }
    void tapFeedback();
    setSelectedDate(null);
    setWeekStart((current) => addDaysIso(current, 7 * delta));
  }

  function shiftMonth(delta: number) {
    void tapFeedback();
    setSelectedDate(null);
    setCursor((current) => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  function goToToday() {
    void tapFeedback();
    const now = new Date();
    setCursor({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
    setWeekStart(mondayOf(todayIso()));
    setSelectedDate(null);
  }

  function switchView(next: "week" | "month") {
    if (next === view) return;
    void tapFeedback();
    setSelectedDate(null);
    if (next === "month") {
      // Le mois ouvert est celui de la semaine qu'on regardait.
      setCursor({
        year: Number(weekMonth.slice(0, 4)),
        month: Number(weekMonth.slice(5, 7)) - 1,
      });
    } else {
      const firstOfMonth = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-01`;
      setWeekStart(
        cursor.year === new Date().getFullYear() &&
          cursor.month === new Date().getMonth()
          ? mondayOf(today)
          : mondayOf(firstOfMonth),
      );
    }
    setView(next);
  }

  const filtered = venueId !== "" || modeId !== "";

  const earliestCreatable = addDaysIso(today, MIN_PROPOSAL_LEAD_DAYS);

  return (
    <Screen
      title={t("calendar.title")}
      action={
        <button
          type="button"
          aria-label={t("calendar.createSession")}
          onClick={() => {
            void tapFeedback("medium");
            setCreating(true);
          }}
          className="flex size-11 items-center justify-center rounded-[14px] bg-accent text-background shadow-[0_10px_28px_-10px_rgb(255_107_26/0.8)] transition-transform active:scale-95"
        >
          <Plus className="size-[22px]" strokeWidth={2.6} aria-hidden />
        </button>
      }
    >
      {/* CAL-010 : issue d'un paiement externe, si l'on en revient */}
      <PaymentReturn />

      {/* Période : précédente, vue semaine ou mois, suivante */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label={
            view === "week"
              ? t("calendar.previousWeek")
              : t("calendar.previousMonth")
          }
          onClick={() => shift(-1)}
          className="flex size-10 items-center justify-center rounded-[10px] border border-border text-muted hover:text-foreground active:opacity-70"
        >
          <ChevronLeft className="size-[18px]" aria-hidden />
        </button>
        <div
          role="group"
          aria-label={t("calendar.viewLabel")}
          className="flex gap-1 rounded-[10px] border border-border bg-surface p-[3px]"
        >
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => switchView(value)}
              className={cn(
                "h-[30px] rounded-lg px-3.5 text-[13px] font-semibold transition-colors",
                view === value
                  ? "bg-surface-raised text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {value === "week" ? t("calendar.week") : t("calendar.month")}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={
            view === "week" ? t("calendar.nextWeek") : t("calendar.nextMonth")
          }
          onClick={() => shift(1)}
          className="flex size-10 items-center justify-center rounded-[10px] border border-border text-muted hover:text-foreground active:opacity-70"
        >
          <ChevronRight className="size-[18px]" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        onClick={goToToday}
        className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:text-foreground"
      >
        {monthLabel}
      </button>

      {view === "week" ? (
        /* Bandeau de la semaine */
        <div className="mb-4 grid grid-cols-7 gap-1.5">
          {weekDays.map((date) => {
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
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                aria-label={
                  count > 0 ? t("calendar.daySessions", { date, count }) : date
                }
                className={cn(
                  "flex h-[66px] flex-col items-center justify-center gap-0.5 rounded-[14px] border transition-colors",
                  isSelected
                    ? "border-accent bg-accent text-background"
                    : isToday
                      ? "border-accent bg-accent/12 text-foreground"
                      : isPast
                        ? "border-border/60 bg-background text-muted/60"
                        : "border-border bg-surface text-foreground",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-bold tracking-[0.1em]",
                    isSelected
                      ? "text-background/80"
                      : isToday
                        ? "text-orange-300"
                        : "text-muted",
                  )}
                >
                  {formatWeekdayShort(date)}
                </span>
                <span className="font-display text-[22px] font-extrabold leading-none">
                  {formatDayNumber(date)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "size-[5px] rounded-full",
                    count === 0
                      ? "bg-transparent"
                      : isSelected
                        ? "bg-background"
                        : "bg-accent",
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : (
        /* Grille du mois, du lundi au dimanche */
        <div className="mb-4 rounded-card border border-border bg-surface p-3">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekdayInitials().map((day, index) => (
              <div
                key={`${day}-${index}`}
                className="py-1 text-center text-[11px] font-bold uppercase text-muted"
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
                    "relative flex aspect-square min-h-[40px] flex-col items-center justify-center rounded-[12px] font-display text-[17px] font-bold transition-colors",
                    isSelected && "bg-accent text-background",
                    !isSelected &&
                      isToday &&
                      "bg-accent/12 text-foreground ring-1 ring-accent",
                    !isSelected && !isToday && isPast && "text-muted/40",
                    !isSelected &&
                      !isToday &&
                      !isPast &&
                      "text-foreground hover:bg-surface-raised",
                  )}
                  aria-label={
                    count > 0
                      ? t("calendar.daySessions", { date, count })
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
      )}

      {/* Filtres serveur : statut en pastilles ; lieu et mode repliés */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={status === tab.id}
            onClick={() => {
              void tapFeedback();
              setStatus(tab.id);
            }}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-[13px] transition-colors",
              status === tab.id
                ? "bg-foreground font-bold text-background"
                : "border border-border font-semibold text-slate-300 hover:text-foreground",
            )}
          >
            {t(tab.cle)}
          </button>
        ))}
        <button
          type="button"
          aria-label={t("calendar.filters")}
          aria-expanded={showFilters || filtered}
          onClick={() => {
            void tapFeedback();
            setShowFilters((open) => !open);
          }}
          className={cn(
            "flex h-9 w-11 shrink-0 items-center justify-center rounded-full border transition-colors",
            filtered
              ? "border-accent bg-accent/12 text-accent"
              : "border-border text-slate-300 hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
        </button>
      </div>

      {(showFilters || filtered) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <select
            aria-label={t("calendar.filterVenue")}
            value={venueId}
            onChange={(event) => setVenueId(event.target.value)}
            className="min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/70"
          >
            <option value="">{t("calendar.allVenues")}</option>
            {(config.data?.venues ?? []).map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("calendar.filterMode")}
            value={modeId}
            onChange={(event) => setModeId(event.target.value)}
            className="min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/70"
          >
            <option value="">{t("calendar.allModes")}</option>
            {/* Un mode fermé n'a rien à filtrer : il n'existe pas ici
                (MODE-003). */}
            {(config.data?.modes ?? [])
              .filter(
                (mode) =>
                  mode.schedulable &&
                  (mode.id !== "bigfoot" ||
                    config.data?.features.bigfoot === true),
              )
              .map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {nomDeMode(mode.id)}
                </option>
              ))}
          </select>
        </div>
      )}

      {(view === "month" || selectedDate) && (
        <SectionTitle
          action={
            selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-[13px] font-semibold text-accent"
              >
                {view === "week"
                  ? t("calendar.seeWholeWeek")
                  : t("calendar.seeWholeMonth")}
              </button>
            )
          }
        >
          {selectedDate
            ? t("calendar.daySessionsTitle", {
                date: selectedDate.split("-").reverse().join("/"),
              })
            : t("calendar.monthSessions")}
        </SectionTitle>
      )}

      <Async query={proposals} loadingLabel={t("calendar.loading")}>
        {() =>
          visible.length === 0 ? (
            <EmptyState
              title={t("calendar.emptyTitle")}
              description={t("calendar.emptyBody", {
                date: earliestCreatable.split("-").reverse().join("/"),
              })}
              icon={<CalendarDays className="size-6" aria-hidden />}
              action={
                <Button variant="accent" onClick={() => setCreating(true)}>
                  {t("calendar.createSession")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {groups.map(([date, sessions]) => (
                <section key={date} aria-label={formatLongDate(date)}>
                  <div className="mb-3 flex items-center gap-2.5">
                    <h3 className="font-display text-[18px] font-extrabold uppercase tracking-[0.06em] first-letter:uppercase">
                      {dayHeading(date)}
                    </h3>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                    <span className="text-[12px] tracking-[0.08em] text-muted">
                      {formatWeekdayShort(date)} {formatDayNumber(date)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {sessions.map((proposal) => (
                      <SessionTicket
                        key={proposal.id}
                        proposal={proposal}
                        onOpen={() => navigate(`/sessions/${proposal.id}`)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        }
      </Async>

      {creating && (
        <CreateProposalSheet
          initialDate={selectedDate ?? earliestCreatable}
          onClose={() => setCreating(false)}
          onCreated={(proposalId) => {
            setCreating(false);
            void proposals.refetch();
            navigate(`/sessions/${proposalId}`);
          }}
        />
      )}
    </Screen>
  );
}
