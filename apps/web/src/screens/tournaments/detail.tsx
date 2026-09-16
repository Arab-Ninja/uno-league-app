import { useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Trophy } from "lucide-react";
import {
  TOURNAMENT_ROUNDS,
  TOURNAMENT_STATUS_LABELS,
  formatEur,
  type TournamentDetail,
  type TournamentMatchView,
  type TournamentRound,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useAuth } from "@/lib/auth.js";
import { useOnline } from "@/lib/use-online.js";
import { formatLongDate } from "@/lib/format.js";
import { notificationFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Input,
  ProgressBar,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Un tournoi et son tableau (TOUR-003, TOUR-004).
 *
 * Le tableau est affiché en entier dès le tirage, affiches vides comprises :
 * un club veut voir le chemin qui le sépare de la finale, pas découvrir son
 * adversaire suivant une fois le précédent battu.
 */
export function TournamentDetailScreen() {
  const { tournamentId } = useParams();
  const id = Number(tournamentId);
  const detail = trpc.tournaments.get.useQuery(
    { tournamentId: id },
    { enabled: Number.isFinite(id) },
  );

  return (
    <Screen title="Tournoi" back backTo="/tournois" withTabBar={false}>
      <Async query={detail}>
        {(tournament) => <TournamentBody tournament={tournament} />}
      </Async>
    </Screen>
  );
}

function TournamentBody({ tournament }: { tournament: TournamentDetail }) {
  const utils = trpc.useUtils();
  const online = useOnline();
  const { isAdmin } = useAuth();

  const register = trpc.tournaments.register.useMutation();
  const withdraw = trpc.tournaments.withdraw.useMutation();
  const draw = trpc.tournaments.draw.useMutation();

  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await notificationFeedback();
      await utils.tournaments.get.invalidate({ tournamentId: tournament.id });
      await utils.tournaments.list.invalidate();
      await utils.squads.mine.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const full = tournament.entryCount >= tournament.size;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{tournament.name}</h2>
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

        <p className="mt-1 text-sm text-muted">
          {formatLongDate(tournament.localDate)} · {tournament.localTimeLabel} ·{" "}
          {tournament.venueName}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface-raised/60 py-2">
            <dt className="text-[10px] uppercase text-muted">Clubs</dt>
            <dd className="text-sm font-semibold">{tournament.size}</dd>
          </div>
          <div className="rounded-lg bg-surface-raised/60 py-2">
            <dt className="text-[10px] uppercase text-muted">Engagement</dt>
            <dd className="text-sm font-semibold">
              {tournament.entryFeeUno} UNO
            </dd>
          </div>
          <div className="rounded-lg bg-surface-raised/60 py-2">
            <dt className="text-[10px] uppercase text-muted">Dotation</dt>
            <dd className="text-sm font-semibold text-accent">
              {tournament.prizeUno} UNO
            </dd>
          </div>
        </dl>

        {tournament.prizeUno > 0 && (
          <p className="mt-2 text-center text-xs text-muted">
            Soit {formatEur(tournament.prizeUno)}, versés à la caisse du club
            vainqueur.
          </p>
        )}

        {tournament.status === "open" && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Engagements</span>
              <span className="tabular-nums text-muted">
                {tournament.entryCount} / {tournament.size}
              </span>
            </div>
            <ProgressBar
              value={tournament.entryCount}
              max={tournament.size}
              tone={full ? "success" : "accent"}
              label="Engagements"
            />
          </div>
        )}
      </Card>

      {tournament.winner && (
        <Card className="flex items-center gap-3 border-accent/40 bg-accent/10">
          <Trophy className="size-6 text-accent" aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Vainqueur
            </p>
            <p className="text-base font-semibold">{tournament.winner.name}</p>
          </div>
        </Card>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Ce que le club du joueur peut faire — tranché par le serveur (P-004) */}
      {tournament.viewer.mayRegister && (
        <div className="space-y-2">
          <Button
            variant="accent"
            fullWidth
            disabled={!online}
            loading={register.isPending}
            onClick={() =>
              void run(() =>
                register.mutateAsync({ tournamentId: tournament.id }),
              )
            }
          >
            Engager mon club — {tournament.entryFeeUno} UNO
          </Button>
          <p className="text-center text-xs text-muted">
            Le droit d'engagement est prélevé sur la caisse du club et y reste
            bloqué jusqu'au tournoi. Si le tournoi est annulé, il vous est
            rendu.
          </p>
        </div>
      )}

      {tournament.viewer.isRegistered && tournament.status === "open" && (
        <Button
          variant="secondary"
          fullWidth
          disabled={!online}
          loading={withdraw.isPending}
          onClick={() =>
            void run(() =>
              withdraw.mutateAsync({ tournamentId: tournament.id }),
            )
          }
        >
          Retirer mon club
        </Button>
      )}

      {tournament.viewer.squadId === null && tournament.status === "open" && (
        <p className="text-center text-xs text-muted">
          Un tournoi se joue par club. Rejoignez ou fondez un club pour vous y
          engager.
        </p>
      )}

      {isAdmin && tournament.status === "open" && (
        <Button
          variant="primary"
          fullWidth
          disabled={!online || !full}
          loading={draw.isPending}
          onClick={() =>
            void run(() => draw.mutateAsync({ tournamentId: tournament.id }))
          }
        >
          {full
            ? "Tirer le tableau"
            : `Tableau tirable à ${tournament.size} clubs`}
        </Button>
      )}

      {/* Le tableau */}
      {tournament.matches.length > 0 ? (
        <Bracket tournament={tournament} />
      ) : (
        <section>
          <SectionTitle>
            Clubs engagés ({tournament.entries.length})
          </SectionTitle>
          {tournament.entries.length === 0 ? (
            <Card>
              <p className="text-center text-xs text-muted">
                Aucun club engagé pour l'instant. Le tableau sera tiré quand le
                plateau sera complet.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {tournament.entries.map((entry) => (
                <Card
                  key={entry.id}
                  className="flex items-center justify-between py-3"
                >
                  <span className="text-sm font-medium">
                    {entry.squad.name}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    Cote {entry.squad.rating}
                  </span>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Le tableau, tour par tour.
 *
 * Chaque tour porte son nom français — seizièmes, huitièmes, quarts — et non
 * son rang : « tour 2 » n'aurait dit à personne s'il restait huit clubs ou
 * quatre.
 */
function Bracket({ tournament }: { tournament: TournamentDetail }) {
  return (
    <div className="space-y-5">
      {tournament.rounds.map(({ round, label }) => {
        const matches = tournament.matches
          .filter((match) => match.round === round)
          .sort((a, b) => a.slot - b.slot);

        if (matches.length === 0) return null;

        return (
          <section key={round}>
            <SectionTitle>{label}</SectionTitle>
            <div className="space-y-2">
              {matches.map((match) => (
                <BracketMatch
                  key={match.id}
                  match={match}
                  tournament={tournament}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Rang d'un tour dans le tableau, du premier à la finale. */
function roundIndex(round: TournamentRound): number {
  return TOURNAMENT_ROUNDS.indexOf(round);
}

function BracketMatch({
  match,
  tournament,
}: {
  match: TournamentMatchView;
  tournament: TournamentDetail;
}) {
  const { isAdmin } = useAuth();
  const played = match.winnerEntryId !== null;
  const ready = match.home !== null && match.away !== null;

  /*
   * Une affiche dont le tour suivant est déjà joué ne se corrige plus ici.
   *
   * Le serveur le refuse, pour ne pas laisser une rencontre gagnée par un club
   * qui n'y figure plus. Offrir le bouton quand même aurait donné un geste qui
   * échoue à tous les coups.
   */
  const followingSlot = Math.floor(match.slot / 2);
  const frozen =
    played &&
    tournament.matches.some(
      (other) =>
        other.slot === followingSlot &&
        other.winnerEntryId !== null &&
        roundIndex(other.round) === roundIndex(match.round) + 1,
    );

  return (
    <Card className="space-y-2 py-3">
      <Side
        name={match.home?.name ?? "À déterminer"}
        score={match.scoreHome}
        won={played && match.home?.id === match.winnerSquadId}
        pending={match.home === null}
        mine={match.home?.id === tournament.viewer.squadId}
      />
      <Side
        name={match.away?.name ?? "À déterminer"}
        score={match.scoreAway}
        won={played && match.away?.id === match.winnerSquadId}
        pending={match.away === null}
        mine={match.away?.id === tournament.viewer.squadId}
      />

      {isAdmin && ready && tournament.status === "drawn" && !frozen && (
        <RecordScore match={match} />
      )}
      {isAdmin && frozen && (
        <p className="border-t border-border/60 pt-2 text-xs text-muted">
          Le tour suivant est joué : pour corriger cette affiche, reprenez
          d'abord le résultat qui en découle.
        </p>
      )}
    </Card>
  );
}

function Side({
  name,
  score,
  won,
  pending,
  mine,
}: {
  name: string;
  score: number | null;
  won: boolean;
  pending: boolean;
  mine: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 truncate text-sm",
          pending && "italic text-muted",
          won && "font-semibold",
          mine && !pending && "text-accent",
        )}
      >
        {won && <Check className="size-3.5 shrink-0" aria-hidden />}
        {name}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted">
        {score ?? "—"}
      </span>
    </div>
  );
}

/**
 * Saisie d'un résultat par l'administration.
 *
 * Le vainqueur est demandé en plus du score, et pas déduit : une élimination
 * directe ne connaît pas le nul, et un 2-2 se tranche aux tirs au but que le
 * score du temps réglementaire ne dit pas.
 */
function RecordScore({ match }: { match: TournamentMatchView }) {
  const utils = trpc.useUtils();
  const online = useOnline();
  const record = trpc.tournaments.record.useMutation();

  const [home, setHome] = useState(String(match.scoreHome ?? ""));
  const [away, setAway] = useState(String(match.scoreAway ?? ""));
  const [winner, setWinner] = useState<number | null>(match.winnerEntryId);
  const [error, setError] = useState<string | null>(null);

  const scoreHome = Number(home);
  const scoreAway = Number(away);
  // Un champ vide ou illisible n'est pas un zéro : `Number("")` vaut 0, et
  // laisser passer cela aurait enregistré un 0-0 qu'on n'a pas saisi.
  const filled =
    home !== "" &&
    away !== "" &&
    Number.isFinite(scoreHome) &&
    Number.isFinite(scoreAway);
  const tied = filled && scoreHome === scoreAway;

  // Un score non nul désigne son vainqueur : le redemander serait offrir de se
  // contredire. Seul un nul laisse le choix, parce qu'il vient des penalties.
  const decided = !filled
    ? null
    : scoreHome > scoreAway
      ? match.homeEntryId
      : scoreAway > scoreHome
        ? match.awayEntryId
        : winner;

  async function submit() {
    setError(null);
    if (decided === null || decided === undefined) {
      setError("Désignez le club qualifié.");
      return;
    }
    try {
      await record.mutateAsync({
        matchId: match.id,
        scoreHome,
        scoreAway,
        winnerEntryId: decided,
      });
      await utils.tournaments.get.invalidate();
      await utils.tournaments.list.invalidate();
      await utils.squads.mine.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={99}
          inputMode="numeric"
          aria-label={`Buts de ${match.home?.name ?? "l'équipe recevante"}`}
          value={home}
          onChange={(event) => setHome(event.target.value)}
          className="min-h-[40px] py-2 text-center"
        />
        <span className="text-xs text-muted">—</span>
        <Input
          type="number"
          min={0}
          max={99}
          inputMode="numeric"
          aria-label={`Buts de ${match.away?.name ?? "l'équipe visiteuse"}`}
          value={away}
          onChange={(event) => setAway(event.target.value)}
          className="min-h-[40px] py-2 text-center"
        />
      </div>

      {tied && (
        <div className="space-y-1">
          <p className="text-xs text-muted">
            Score nul : désignez le club qualifié aux tirs au but.
          </p>
          <div className="flex gap-2">
            {[
              { id: match.homeEntryId, name: match.home?.name },
              { id: match.awayEntryId, name: match.away?.name },
            ]
              .filter(
                (side): side is { id: number; name: string | undefined } =>
                  side.id !== null,
              )
              .map((side) => (
                <button
                  key={side.id}
                  type="button"
                  onClick={() => setWinner(side.id)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                    winner === side.id
                      ? "bg-accent text-background"
                      : "bg-surface-raised text-muted",
                  )}
                >
                  {side.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}

      <Button
        variant="secondary"
        fullWidth
        disabled={!online || !filled}
        loading={record.isPending}
        onClick={() => void submit()}
        className="min-h-[40px] py-2 text-xs"
      >
        {match.winnerEntryId === null ? "Enregistrer le résultat" : "Corriger"}
      </Button>
    </div>
  );
}
