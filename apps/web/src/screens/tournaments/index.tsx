import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trophy } from "lucide-react";
import {
  TOURNAMENT_PROPOSAL_LEAD_DAYS,
  TOURNAMENT_STATUS_LABELS,
  addDaysIso,
  diffDaysIso,
  formatEur,
  type TournamentFormatView,
  type TournamentSummary,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { imageSrc } from "@/lib/images.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { WEEKDAYS, monthLabel, monthMatrix, monthRange } from "@/lib/month.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui/index.js";
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

  const range = useMemo(
    () => monthRange(cursor.year, cursor.month),
    [cursor],
  );

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
      map.set(
        tournament.localDate,
        (map.get(tournament.localDate) ?? 0) + 1,
      );
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
      title="Tournois"
      back
      backTo="/squad"
      withTabBar={false}
      action={
        mayPropose ? (
          <button
            type="button"
            aria-label="Proposer un tournoi"
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
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Des clubs entiers s'affrontent en élimination directe, deux heures
        durant. Le droit d'engagement sort de la caisse du club, et le vainqueur
        remporte la dotation.
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
          aria-label="Mois précédent"
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
                aria-label={`${date}${count > 0 ? `, ${count} tournoi(s)` : ""}`}
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
              Voir tout le mois
            </button>
          )
        }
      >
        {selectedDate
          ? `Tournois du ${selectedDate.split("-").reverse().join("/")}`
          : "Tournois du mois"}
      </SectionTitle>

      <Async query={list} loadingLabel="Chargement des tournois...">
        {() =>
          visible.length === 0 ? (
            <EmptyState
              title="Aucun tournoi ce mois-ci"
              description={
                mayPropose
                  ? `Posez une date à partir du ${earliest.split("-").reverse().join("/")} : votre club sera engagé aussitôt, et les autres viendront compléter le plateau.`
                  : "Le fondateur et les capitaines de votre club peuvent en proposer un."
              }
              icon={<CalendarDays className="size-6" aria-hidden />}
              action={
                mayPropose ? (
                  <Button variant="accent" onClick={() => setProposing(true)}>
                    Proposer un tournoi
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
              <p className="text-[11px] font-semibold leading-tight text-white">
                {format.name}
              </p>
              <p className="text-[10px] text-white/70">
                {format.size} clubs
                {format.openCount > 0 && ` · ${format.openCount} ouvert${format.openCount > 1 ? "s" : ""}`}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function TournamentCard({
  tournament,
}: {
  tournament: TournamentSummary;
}) {
  const navigate = useNavigate();
  const full = tournament.entryCount >= tournament.size;

  return (
    <Card
      className="cursor-pointer transition-transform active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onClick={() => {
        void tapFeedback();
        navigate(`/tournois/${tournament.id}`);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-accent/15 p-2.5 text-accent">
          <Trophy className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold">{tournament.name}</h3>
            <Badge
              tone={tournament.status === "completed" ? "accent" : "primary"}
            >
              {TOURNAMENT_STATUS_LABELS[tournament.status]}
            </Badge>
          </div>

          <p className="mt-1 text-xs text-muted">
            {formatLongDate(tournament.localDate)} · {tournament.localTimeLabel}{" "}
            · {tournament.venueName}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {/*
              Le compte des engagés est ce qui presse : un plateau qui se
              remplit ferme la porte, et l'afficher après coup n'aurait servi à
              personne.
            */}
            <span className={full ? "font-medium text-warning" : "text-muted"}>
              {tournament.entryCount} / {tournament.size} clubs
            </span>
            {tournament.entryFeeUno > 0 && (
              <span className="text-muted">
                Engagement {tournament.entryFeeUno} UNO
              </span>
            )}
            {tournament.prizeUno > 0 && (
              <span className="font-medium text-accent">
                Dotation {tournament.prizeUno} UNO (
                {formatEur(tournament.prizeUno)})
              </span>
            )}
          </div>

          {tournament.winner && (
            <p className="mt-2 text-xs font-medium text-accent">
              Vainqueur : {tournament.winner.name}
            </p>
          )}
          {tournament.viewer.isRegistered && !tournament.winner && (
            <p className="mt-2 text-xs font-medium text-success">
              Votre club est engagé.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
