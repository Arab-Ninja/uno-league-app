import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import {
  MIN_PROPOSAL_LEAD_DAYS,
  addDaysIso,
  diffDaysIso,
  type ProposalStatus,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SessionCard } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import { Button, EmptyState, SectionTitle } from "@/components/ui/index.js";
import { CreateProposalSheet } from "./create-proposal.js";

/**
 * Calendrier (CAL-001, CAL-002).
 *
 * La grille est alignée du lundi au dimanche. Les filtres de lieu, de mode et
 * de statut sont envoyés au serveur : le client ne filtre jamais lui-même une
 * liste tronquée.
 */

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const STATUS_TABS: { id: ProposalStatus | "all"; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "proposal", label: "Propositions" },
  { id: "reservation", label: "Réservations" },
  { id: "session", label: "Sessions" },
];

function monthMatrix(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay : 0 = dimanche. On décale pour commencer le lundi.
  const leading = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarScreen() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

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

  const range = useMemo(() => {
    const start = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    return {
      from: start,
      to: `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${lastDay}`,
    };
  }, [cursor]);

  const proposals = trpc.proposals.list.useQuery({
    from: range.from,
    to: range.to,
    ...(venueId ? { venueId } : {}),
    ...(modeId ? { modeId: modeId as "friendly" | "league" } : {}),
    ...(status !== "all" ? { status } : {}),
    mineOnly: false,
  });

  const cells = useMemo(
    () => monthMatrix(cursor.year, cursor.month),
    [cursor],
  );

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const proposal of proposals.data ?? []) {
      map.set(proposal.localDate, (map.get(proposal.localDate) ?? 0) + 1);
    }
    return map;
  }, [proposals.data]);

  const visible = useMemo(() => {
    const list = proposals.data ?? [];
    return selectedDate
      ? list.filter((proposal) => proposal.localDate === selectedDate)
      : list;
  }, [proposals.data, selectedDate]);

  const monthLabel = new Intl.DateTimeFormat("fr-BE", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

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
    setSelectedDate(null);
  }

  const earliestCreatable = addDaysIso(today, MIN_PROPOSAL_LEAD_DAYS);

  return (
    <Screen
      title="Calendrier"
      action={
        <button
          type="button"
          aria-label="Créer une session"
          onClick={() => {
            void tapFeedback("medium");
            setCreating(true);
          }}
          className="flex size-11 items-center justify-center rounded-full bg-accent text-background transition-transform active:scale-95"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      }
    >
      {/* Navigation mensuelle */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => shiftMonth(-1)}
          className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={goToToday}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors hover:bg-surface-raised"
        >
          {monthLabel}
        </button>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => shiftMonth(1)}
          className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {/* Grille du mois, du lundi au dimanche */}
      <div className="mb-4 rounded-card border border-border/60 bg-surface p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day, index) => (
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
                  !isSelected && isToday && "ring-1 ring-accent text-accent font-semibold",
                  !isSelected && !isToday && isPast && "text-muted/40",
                  !isSelected && !isToday && !isPast && "text-foreground hover:bg-surface-raised",
                )}
                aria-label={`${date}${count > 0 ? `, ${count} session(s)` : ""}`}
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

      {/* Filtres serveur : lieu, mode, statut */}
      <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              void tapFeedback();
              setStatus(tab.id);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              status === tab.id
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <select
          aria-label="Filtrer par lieu"
          value={venueId}
          onChange={(event) => setVenueId(event.target.value)}
          className="min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/70"
        >
          <option value="">Tous les lieux</option>
          {(config.data?.venues ?? []).map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer par mode"
          value={modeId}
          onChange={(event) => setModeId(event.target.value)}
          className="min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/70"
        >
          <option value="">Tous les modes</option>
          {(config.data?.modes ?? [])
            .filter((mode) => mode.schedulable)
            .map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ))}
        </select>
      </div>

      <SectionTitle
        action={
          selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs font-medium text-accent"
            >
              Voir tout le mois
            </button>
          )
        }
      >
        {selectedDate ? `Sessions du ${selectedDate.split("-").reverse().join("/")}` : "Sessions du mois"}
      </SectionTitle>

      <Async query={proposals} loadingLabel="Chargement des sessions...">
        {() =>
          visible.length === 0 ? (
            <EmptyState
              title="Aucune session"
              description={`Créez une proposition à partir du ${earliestCreatable.split("-").reverse().join("/")}.`}
              icon={<CalendarDays className="size-6" aria-hidden />}
              action={
                <Button variant="accent" onClick={() => setCreating(true)}>
                  Créer une session
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {visible.map((proposal) => (
                <SessionCard
                  key={proposal.id}
                  proposal={proposal}
                  onOpen={() => navigate(`/sessions/${proposal.id}`)}
                />
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
