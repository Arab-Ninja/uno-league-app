import { useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import {
  TOURNAMENT_STATUS_LABELS,
  formatEur,
  type TournamentSummary,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Card,
  EmptyState,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Les tournois de la ligue (TOUR-004).
 *
 * Deux listes plutôt qu'une : ce qui est encore ouvert appelle une décision —
 * engager son club, et vite, car le plateau se remplit — tandis que ce qui est
 * joué se consulte. Les mêmes cartes mêlées auraient noyé la première dans la
 * seconde au fil des saisons.
 */
export function TournamentsScreen() {
  const list = trpc.tournaments.list.useQuery({ mineOnly: false });

  return (
    <Screen title="Tournois" back backTo="/squad" withTabBar={false}>
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Des clubs entiers s'affrontent en élimination directe. On s'y engage par
        club, le droit d'inscription est prélevé sur la caisse du club, et le
        vainqueur remporte la dotation.
      </p>

      <Async query={list}>
        {(tournaments) => {
          const open = tournaments.filter(
            (row) => row.status === "open" || row.status === "drawn",
          );
          const past = tournaments.filter(
            (row) => row.status === "completed" || row.status === "cancelled",
          );

          if (tournaments.length === 0) {
            return (
              <EmptyState
                title="Aucun tournoi pour l'instant"
                description="Les tournois à venir seront annoncés ici. Votre club pourra s'y engager depuis cet écran."
              />
            );
          }

          return (
            <div className="space-y-5">
              {open.length > 0 && (
                <section>
                  <SectionTitle>À venir</SectionTitle>
                  <div className="space-y-2">
                    {open.map((tournament) => (
                      <TournamentCard
                        key={tournament.id}
                        tournament={tournament}
                      />
                    ))}
                  </div>
                </section>
              )}

              {past.length > 0 && (
                <section>
                  <SectionTitle>Palmarès</SectionTitle>
                  <div className="space-y-2">
                    {past.map((tournament) => (
                      <TournamentCard
                        key={tournament.id}
                        tournament={tournament}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          );
        }}
      </Async>
    </Screen>
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
              tone={
                tournament.status === "completed"
                  ? "accent"
                  : tournament.status === "cancelled"
                    ? "neutral"
                    : "primary"
              }
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
