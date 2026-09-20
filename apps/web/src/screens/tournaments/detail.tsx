import { useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Shirt, Trophy } from "lucide-react";
import {
  TOURNAMENT_ROUNDS,
  formatEur,
  type PublicPlayer,
  type TournamentDetail,
  type TournamentMatchView,
  type TournamentRound,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useAuth } from "@/lib/auth.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { useOnline } from "@/lib/use-online.js";
import { formatLongDate } from "@/lib/format.js";
import { notificationFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { LineupComposer } from "@/components/pitch/futsal-pitch.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { Avatar } from "@/components/domain/index.js";
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
  const t = useT();
  const { tournamentId } = useParams();
  const id = Number(tournamentId);
  const detail = trpc.tournaments.get.useQuery(
    { tournamentId: id },
    { enabled: Number.isFinite(id) },
  );

  return (
    <Screen
      title={t("tournament.title")}
      back
      backTo="/tournois"
      withTabBar={false}
    >
      <Async query={detail}>
        {(tournament) => <TournamentBody tournament={tournament} />}
      </Async>
    </Screen>
  );
}

function TournamentBody({ tournament }: { tournament: TournamentDetail }) {
  const t = useT();
  const L = useLibelles();
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
            {L.tournamentStatus[tournament.status]}
          </Badge>
        </div>

        <p className="mt-1 text-sm text-muted">
          {formatLongDate(tournament.localDate)} · {tournament.localTimeLabel} ·{" "}
          {tournament.venueName}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface-raised/60 py-2">
            <dt className="text-[10px] uppercase text-muted">
              {t("tournament.clubs")}
            </dt>
            <dd className="text-sm font-semibold">{tournament.size}</dd>
          </div>
          <div className="rounded-lg bg-surface-raised/60 py-2">
            <dt className="text-[10px] uppercase text-muted">
              {t("tournament.entryFee")}
            </dt>
            <dd className="text-sm font-semibold">
              {tournament.entryFeeUno} UNO
            </dd>
          </div>
          <div className="rounded-lg bg-surface-raised/60 py-2">
            <dt className="text-[10px] uppercase text-muted">
              {t("tournament.prize")}
            </dt>
            <dd className="text-sm font-semibold text-accent">
              {tournament.prizeUno} UNO
            </dd>
          </div>
        </dl>

        {tournament.prizeUno > 0 && (
          <p className="mt-2 text-center text-xs text-muted">
            {t("tournament.prizeNote", {
              euros: formatEur(tournament.prizeUno),
            })}
          </p>
        )}

        {tournament.status === "open" && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("tournament.entries")}</span>
              <span className="tabular-nums text-muted">
                {tournament.entryCount} / {tournament.size}
              </span>
            </div>
            <ProgressBar
              value={tournament.entryCount}
              max={tournament.size}
              tone={full ? "success" : "accent"}
              label={t("tournament.entries")}
            />
          </div>
        )}
      </Card>

      {tournament.winner && (
        <Card className="flex items-center gap-3 border-accent/40 bg-accent/10">
          <Trophy className="size-6 text-accent" aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              {t("tournament.winner")}
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
            {t("tournament.registerMyClub", {
              amount: tournament.entryFeeUno,
            })}
          </Button>
          <p className="text-center text-xs text-muted">
            {t("tournament.entryFeeNote")}
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
          {t("tournament.withdrawMyClub")}
        </Button>
      )}

      {tournament.viewer.squadId === null && tournament.status === "open" && (
        <p className="text-center text-xs text-muted">
          {t("tournament.needAClub")}
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
            ? t("tournament.drawBracket")
            : t("tournament.drawableAt", { size: tournament.size })}
        </Button>
      )}

      {/*
        Qui joue (TOUR-007). Avant le tableau : le jour du tournoi, la
        première question n'est pas « contre qui » mais « qui vient ».
      */}
      <TournamentLineups tournament={tournament} />

      {/* Le tableau */}
      {tournament.matches.length > 0 ? (
        <Bracket tournament={tournament} />
      ) : (
        <section>
          <SectionTitle>
            {t("tournament.registeredClubs", {
              count: tournament.entries.length,
            })}
          </SectionTitle>
          {tournament.entries.length === 0 ? (
            <Card>
              <p className="text-center text-xs text-muted">
                {t("tournament.noneRegistered")}
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
                    {t("tournament.rating", { rating: entry.squad.rating })}
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
 * Qui joue, club par club (TOUR-007).
 *
 * Un tournoi ne demandait à personne qui jouait : le club s'engageait entier,
 * et le jour venu on ne savait pas qui devait se présenter. Ce n'est pas une
 * statistique — un tournoi n'en produit aucune par joueur — mais une
 * information de terrain, et elle suffit à elle seule à être nécessaire.
 *
 * Les feuilles de tous les clubs sont visibles : savoir qui l'on affronte
 * fait partie du tournoi, exactement comme les deux feuilles d'un défi. Seul
 * le sien se compose, et seulement par un fondateur ou un capitaine — ce que
 * le serveur vérifie de son côté.
 */
function TournamentLineups({ tournament }: { tournament: TournamentDetail }) {
  const t = useT();
  const L = useLibelles();
  const lineups = trpc.tournaments.lineups.useQuery({
    tournamentId: tournament.id,
  });

  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  // L'engagement de son propre club, s'il y en a un : c'est lui qui porte la
  // feuille qu'on peut composer.
  const myEntry = tournament.entries.find(
    (entry) => entry.squad.id === tournament.viewer.squadId,
  );

  const others = (lineups.data ?? []).filter(
    (row) => row.entryId !== myEntry?.id,
  );

  if (tournament.entries.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>Qui joue</SectionTitle>

      {myEntry && (
        <MyTournamentLineup entryId={myEntry.id} onOpen={setZoomed} />
      )}

      {others.map((row) => (
        <Card key={row.entryId} className="space-y-2">
          <p className="text-sm font-semibold">{row.squad.name}</p>
          <ul className="space-y-1">
            {row.players.map(({ slot, player }) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => setZoomed(player)}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-raised"
                >
                  <Avatar
                    name={player.displayName}
                    url={player.profilePhotoUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {player.displayName}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted">
                    {L.lineupSlot[slot]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {/*
        Un club engagé qui n'a encore annoncé personne se dit, plutôt que de
        manquer : c'est précisément ce qu'on vient vérifier la veille.
      */}
      {tournament.entries
        .filter(
          (entry) =>
            entry.id !== myEntry?.id &&
            !others.some((row) => row.entryId === entry.id),
        )
        .map((entry) => (
          <Card key={entry.id} className="py-3">
            <p className="text-sm font-medium">{entry.squad.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {t("tournament.noLineupYet")}
            </p>
          </Card>
        ))}

      {zoomed && (
        <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
      )}
    </section>
  );
}

/**
 * La feuille de son propre club, composable sur le terrain.
 *
 * Même geste qu'au Cinq type d'un club : on touche un emplacement, puis le
 * joueur. Le composant est le même — deux copies auraient fini par diverger
 * sur l'interaction la plus délicate de l'application.
 *
 * Aucun repli statistique ici, contrairement au club : une feuille vide
 * n'annonce personne. Deviner qui joue serait une information fausse, et
 * c'est exactement celle qu'on est venu chercher.
 */
function MyTournamentLineup({
  entryId,
  onOpen,
}: {
  entryId: number;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const mine = trpc.squads.mine.useQuery();
  const stored = trpc.tournaments.entryLineup.useQuery({ entryId });

  const save = trpc.tournaments.setEntryLineup.useMutation();
  const fill = trpc.tournaments.fillEntryFromSquadLineup.useMutation();

  const [failure, setFailure] = useState<string | null>(null);

  const squad = mine.data?.squad ?? null;
  const players = (squad?.members ?? []).map((member) => member.player);
  const mayCompose =
    squad?.viewer.role === "founder" || squad?.viewer.role === "captain";

  const refresh = async () => {
    await utils.tournaments.entryLineup.invalidate({ entryId });
    await utils.tournaments.lineups.invalidate();
  };

  return (
    <div className="space-y-2">
      <LineupComposer
        title={t("tournament.myFive")}
        players={players}
        stored={stored.data ?? []}
        mayCompose={mayCompose === true}
        readHint={t("tournament.myFiveRead")}
        composedHint={t("tournament.myFiveChosen")}
        fallbackToStats={false}
        saving={save.isPending}
        clearing={false}
        onSave={async (assignments) => {
          await save.mutateAsync({ entryId, assignments });
          await refresh();
        }}
        onOpen={onOpen}
      />

      {failure && <ErrorBanner message={failure} />}

      {/*
        Le raccourci vers le cinq type du club : c'est tout l'intérêt d'avoir
        composé un terrain. Il remplace la feuille plutôt que de la compléter
        — on demande le cinq type, on l'obtient en entier.
      */}
      {mayCompose && (
        <Button
          variant="secondary"
          fullWidth
          loading={fill.isPending}
          onClick={async () => {
            setFailure(null);
            try {
              await fill.mutateAsync({ entryId });
              await refresh();
            } catch (caught) {
              setFailure(describeError(caught).message);
            }
          }}
        >
          <Shirt className="size-4" aria-hidden />
          {t("tournament.useClubFive")}
        </Button>
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
  const L = useLibelles();
  return (
    <div className="space-y-5">
      {tournament.rounds.map(({ round }) => {
        const matches = tournament.matches
          .filter((match) => match.round === round)
          .sort((a, b) => a.slot - b.slot);

        if (matches.length === 0) return null;

        return (
          <section key={round}>
            <SectionTitle>{L.tournamentRound[round]}</SectionTitle>
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
  const t = useT();
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
        name={match.home?.name ?? t("tournament.toBeDetermined")}
        score={match.scoreHome}
        won={played && match.home?.id === match.winnerSquadId}
        pending={match.home === null}
        mine={match.home?.id === tournament.viewer.squadId}
      />
      <Side
        name={match.away?.name ?? t("tournament.toBeDetermined")}
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
