import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Trophy } from "lucide-react";
import {
  TOURNAMENT_DURATION_HOURS,
  TOURNAMENT_STATUS_LABELS,
  formatEur,
  type TournamentSummary,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useOnline } from "@/lib/use-online.js";
import { formatLongDate } from "@/lib/format.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
  Select,
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
        Des clubs entiers s'affrontent en élimination directe, deux heures
        durant. Le droit d'engagement sort de la caisse du club, et le vainqueur
        remporte la dotation.
      </p>

      <ProposeTournament />

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

/**
 * Un club pose une date sur un format (TOUR-005).
 *
 * C'est le calendrier des clubs : la ligue dit ce qui existe — combien
 * d'équipes, combien coûte l'engagement, combien rapporte la victoire — et
 * ceux qui veulent jouer choisissent le jour et la salle. Proposer engage
 * aussitôt son club : un plateau que personne ne défend ferait attendre le
 * premier arrivant devant un club fantôme.
 *
 * Le bouton n'apparaît qu'aux dirigeants. Un simple membre le verrait échouer,
 * et un geste qui échoue toujours vaut moins que pas de geste.
 */
function ProposeTournament() {
  const utils = trpc.useUtils();
  const online = useOnline();

  const mine = trpc.squads.mine.useQuery();
  const formats = trpc.tournaments.formats.useQuery();
  const venues = trpc.proposals.venues.useQuery();
  const propose = trpc.tournaments.propose.useMutation();

  const [open, setOpen] = useState(false);
  const [formatId, setFormatId] = useState("");
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("18");
  const [venueId, setVenueId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const role = mine.data?.squad?.viewer.role ?? null;
  const mayPropose = role === "founder" || role === "captain";
  const chosen = (formats.data ?? []).find(
    (row) => String(row.id) === formatId,
  );

  if (!mayPropose || (formats.data ?? []).length === 0) return null;

  async function submit() {
    setError(null);
    try {
      await propose.mutateAsync({
        formatId: Number(formatId),
        date,
        slotStartHour: Number(hour),
        venueId,
      });
      setOpen(false);
      setFormatId("");
      setDate("");
      setVenueId("");
      await utils.tournaments.list.invalidate();
      await utils.squads.mine.invalidate();
      await notificationFeedback();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  if (!open) {
    return (
      <Button
        variant="accent"
        fullWidth
        className="mb-5"
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
      >
        <CalendarPlus className="size-4" aria-hidden />
        Proposer un tournoi
      </Button>
    );
  }

  return (
    <Card className="mb-5 space-y-3">
      <Field label="Format" htmlFor="propose-format">
        <Select
          id="propose-format"
          value={formatId}
          onChange={(event) => setFormatId(event.target.value)}
        >
          <option value="">Choisir un format</option>
          {(formats.data ?? []).map((format) => (
            <option key={format.id} value={format.id}>
              {format.name} — {format.size} clubs
            </option>
          ))}
        </Select>
      </Field>

      {chosen && (
        <p className="text-xs leading-relaxed text-muted">
          {chosen.size} clubs, {TOURNAMENT_DURATION_HOURS} heures.{" "}
          {chosen.entryFeeUno} UNO sortent de votre caisse à l'engagement, et le
          vainqueur en remporte {chosen.prizeUno}.
          {chosen.openCount > 0 && (
            <>
              {" "}
              {chosen.openCount} tournoi
              {chosen.openCount > 1 ? "s" : ""} de ce format attend
              {chosen.openCount > 1 ? "ent" : ""} déjà des clubs — vous pouvez
              aussi en rejoindre un plutôt que d'en poser un nouveau.
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="propose-date">
          <Input
            id="propose-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Heure" htmlFor="propose-hour">
          <Select
            id="propose-hour"
            value={hour}
            onChange={(event) => setHour(event.target.value)}
          >
            {Array.from({ length: 15 }, (_, index) => index + 8).map(
              (value) => (
                <option key={value} value={value}>
                  {String(value).padStart(2, "0")}:00 –{" "}
                  {String(value + TOURNAMENT_DURATION_HOURS).padStart(2, "0")}
                  :00
                </option>
              ),
            )}
          </Select>
        </Field>
      </div>

      <Field label="Salle" htmlFor="propose-venue">
        <Select
          id="propose-venue"
          value={venueId}
          onChange={(event) => setVenueId(event.target.value)}
        >
          <option value="">Choisir une salle</option>
          {(venues.data ?? []).map((venue) => (
            <option key={venue.id} value={venue.slug}>
              {venue.name}
            </option>
          ))}
        </Select>
      </Field>

      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Annuler
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={propose.isPending}
          disabled={!online || !formatId || !date || !venueId}
          onClick={() => void submit()}
        >
          Proposer et engager
        </Button>
      </div>
    </Card>
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
