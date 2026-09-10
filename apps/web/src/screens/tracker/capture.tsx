import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Flag,
  Keyboard,
  ListOrdered,
  Loader2,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import {
  TRACKER_MATCH_DURATION_MS,
  aggregateMatch,
  aggregateSession,
  checkMatch,
  formatMatchClock,
  formatPoints,
  goalkeeperAt,
  matchClockFromVideo,
  trackerAction,
  type TrackerEvent,
  type TrackerEventType,
  type TrackerEventView,
  type TrackerMatchView,
  type TrackerSheet,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { Async } from "@/components/ui/async.js";
import { Button, Card } from "@/components/ui/index.js";
import { CapturePad, type PadMode } from "./capture-pad.js";
import { RosterPanel } from "./roster-panel.js";
import { VideoDeck, type VideoDeckHandle } from "./video-deck.js";
import { useCapture, newClientId } from "./use-capture.js";
import { PublishPanel } from "./publish-panel.js";

/**
 * Écran de saisie en visionnage (TRACK-001).
 *
 * Tout est disposé pour qu'un fait de jeu se relève sans quitter la vidéo des
 * yeux : l'enregistrement à gauche, les joueurs à droite, le journal dessous.
 * Aucune de ces trois zones ne se recouvre — chercher une fenêtre pendant
 * qu'une action se joue, c'est manquer l'action.
 *
 * L'horloge du match n'est jamais saisie : elle se déduit de la position dans
 * l'enregistrement, une fois le coup d'envoi posé. Une action relevée porte
 * donc à la fois sa minute de jeu et son timecode, et une ligne du journal
 * ramène la vidéo à l'instant exact.
 */

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function TrackerCaptureScreen() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = Number(params.sessionId);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const sheet = trpc.tracker.get.useQuery(
    { sessionId },
    { enabled: Number.isFinite(sessionId) },
  );

  const applySheet = useCallback(
    (next: TrackerSheet) => utils.tracker.get.setData({ sessionId }, next),
    [utils, sessionId],
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-3 sm:px-4">
      <button
        type="button"
        onClick={() => navigate("/visionnage")}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Feuilles de saisie
      </button>

      <Async query={sheet} loadingLabel="Ouverture de la feuille...">
        {(data) => (
          <CaptureWorkspace sheet={data} onChanged={applySheet} />
        )}
      </Async>
    </div>
  );
}

function CaptureWorkspace({
  sheet,
  onChanged,
}: {
  sheet: TrackerSheet;
  onChanged: (next: TrackerSheet) => void;
}) {
  const sessionId = sheet.session.id;
  const store = useCapture(sessionId, sheet);
  const deck = useRef<VideoDeckHandle | null>(null);

  const updateMatch = trpc.tracker.updateMatch.useMutation();
  const addMatch = trpc.tracker.addMatch.useMutation();
  const removeMatch = trpc.tracker.removeMatch.useMutation();

  const [videoMs, setVideoMs] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [tab, setTab] = useState<"capture" | "roster" | "summary">("capture");
  const [padMode, setPadMode] = useState<PadMode>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);

  // Match courant : celui qui n'est pas terminé, sinon le dernier de la
  // séance. Rouvrir la feuille reprend donc là où la saisie s'est arrêtée.
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const match: TrackerMatchView | null = useMemo(() => {
    if (sheet.matches.length === 0) return null;
    const chosen = sheet.matches.find((item) => item.id === selectedMatchId);
    if (chosen) return chosen;
    return (
      sheet.matches.find((item) => item.status !== "finished") ??
      sheet.matches[sheet.matches.length - 1] ??
      null
    );
  }, [sheet.matches, selectedMatchId]);

  const domainEvents: TrackerEvent[] = useMemo(
    () =>
      store.events.map((event) => ({
        clientId: event.clientId,
        matchId: event.matchId,
        type: event.type as TrackerEventType,
        participantId: event.participantId,
        assistParticipantId: event.assistParticipantId,
        teamId: event.teamId,
        clockMs: event.clockMs,
        videoMs: event.videoMs,
      })),
    [store.events],
  );

  const clockMs =
    match?.videoStartMs != null
      ? matchClockFromVideo(videoMs, match.videoStartMs)
      : 0;

  const aggregate = useMemo(
    () =>
      match
        ? aggregateMatch(
            { id: match.id, teamAId: match.teamAId, teamBId: match.teamBId },
            domainEvents,
          )
        : null,
    [match, domainEvents],
  );

  const statsByParticipant = useMemo(
    () =>
      new Map((aggregate?.participants ?? []).map((line) => [line.participantId, line])),
    [aggregate],
  );

  const teamA = sheet.teams.find((team) => team.id === match?.teamAId) ?? null;
  const teamB = sheet.teams.find((team) => team.id === match?.teamBId) ?? null;

  const rosterA = useMemo(
    () => sheet.participants.filter((player) => player.teamId === match?.teamAId),
    [sheet.participants, match],
  );
  const rosterB = useMemo(
    () => sheet.participants.filter((player) => player.teamId === match?.teamBId),
    [sheet.participants, match],
  );

  // Gardien en poste à l'instant regardé, et non à la fin du match : en
  // revenant en arrière dans l'enregistrement, c'est bien le gardien de ce
  // moment-là qu'un arrêt doit créditer.
  const goalkeepers = useMemo(() => {
    if (!match) return {};
    return {
      [match.teamAId]: goalkeeperAt(domainEvents, match.id, match.teamAId, clockMs),
      [match.teamBId]: goalkeeperAt(domainEvents, match.id, match.teamBId, clockMs),
    } as Record<number, number | null>;
  }, [match, domainEvents, clockMs]);

  const keyByParticipant = useMemo(() => {
    const map = new Map<number, string>();
    [...rosterA, ...rosterB].forEach((player, index) => {
      const key = DIGITS[index];
      if (key) map.set(player.id, key);
    });
    return map;
  }, [rosterA, rosterB]);

  const participantByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const [participantId, key] of keyByParticipant) map.set(key, participantId);
    return map;
  }, [keyByParticipant]);

  // Une action ne peut se relever que sur un match ouvert d'une feuille
  // modifiable : ailleurs, elle n'aurait ni minute de jeu ni effet.
  const capturable =
    match !== null &&
    match.status !== "pending" &&
    sheet.session.status !== "published";

  async function run(action: () => Promise<TrackerSheet>): Promise<void> {
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  // --- Enregistrement d'une action ------------------------------------------

  const capture = useCallback(
    (type: TrackerEventType, participantId: number): TrackerEventView | null => {
      if (!match) return null;
      const player = sheet.participants.find((item) => item.id === participantId);
      if (!player) return null;

      const currentVideoMs = deck.current?.currentMs() ?? null;
      const clock =
        match.videoStartMs != null && currentVideoMs != null
          ? matchClockFromVideo(currentVideoMs, match.videoStartMs)
          : Math.min(clockMs, TRACKER_MATCH_DURATION_MS);

      const event: TrackerEventView = {
        clientId: newClientId(),
        matchId: match.id,
        type,
        participantId,
        assistParticipantId: null,
        // L'équipe portée par l'action est celle du joueur au moment du geste.
        teamId: player.teamId,
        clockMs: clock,
        videoMs: currentVideoMs,
      };

      store.record(event);
      return event;
    },
    [match, sheet.participants, store, clockMs],
  );

  const onAction = useCallback(
    (type: TrackerEventType) => {
      if (padMode.kind !== "armed") return;
      const event = capture(type, padMode.participantId);
      if (!event) return;

      if (trackerAction(type).asksAssist) {
        setPadMode({
          kind: "assist",
          goalClientId: event.clientId,
          scorerId: event.participantId,
          teamId: event.teamId,
        });
      } else {
        setPadMode({ kind: "idle" });
      }
    },
    [padMode, capture],
  );

  const onAssist = useCallback(
    (participantId: number | null) => {
      if (padMode.kind !== "assist") return;
      if (participantId !== null) {
        const goal = store.events.find(
          (event) => event.clientId === padMode.goalClientId,
        );
        // Même identifiant : le passeur complète le but, il n'ajoute pas une
        // seconde action. Le score ne peut donc pas doubler par mégarde.
        if (goal) store.record({ ...goal, assistParticipantId: participantId });
      }
      setPadMode({ kind: "idle" });
    },
    [padMode, store],
  );

  const onQuickSave = useCallback(
    (teamId: number) => {
      const keeper = goalkeepers[teamId];
      if (keeper == null) return;
      capture("save", keeper);
    },
    [goalkeepers, capture],
  );

  // --- Clavier ---------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(nativeEvent: KeyboardEvent): void {
      const target = nativeEvent.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = nativeEvent.key.toLowerCase();

      // Transport vidéo : disponible dans tous les modes, parce qu'on revient
      // en arrière justement pendant qu'une action est en cours de saisie.
      if (key === " " || nativeEvent.code === "Space") {
        nativeEvent.preventDefault();
        deck.current?.toggle();
        return;
      }
      if (key === "arrowleft") {
        nativeEvent.preventDefault();
        deck.current?.seekBy(nativeEvent.shiftKey ? -1000 : -3000);
        return;
      }
      if (key === "arrowright") {
        nativeEvent.preventDefault();
        deck.current?.seekBy(nativeEvent.shiftKey ? 1000 : 3000);
        return;
      }
      // Annuler ne vaut que sur une feuille modifiable : sur une feuille
      // publiée, la suppression partirait dans une file que le serveur
      // refuserait indéfiniment.
      if ((nativeEvent.ctrlKey || nativeEvent.metaKey) && key === "z" && capturable) {
        nativeEvent.preventDefault();
        store.undo();
        setPadMode({ kind: "idle" });
        return;
      }
      if (key === "escape") {
        setPadMode({ kind: "idle" });
        return;
      }

      // Au-delà du transport vidéo, rien ne se saisit tant que le coup
      // d'envoi n'est pas posé — l'action n'aurait pas de minute de jeu — ni
      // sur une feuille publiée, qui est figée.
      if (!capturable) return;

      if (padMode.kind === "assist") {
        if (key === "enter") {
          nativeEvent.preventDefault();
          onAssist(null);
          return;
        }
        const participantId = participantByKey.get(key);
        if (participantId !== undefined && participantId !== padMode.scorerId) {
          nativeEvent.preventDefault();
          onAssist(participantId);
        }
        return;
      }

      if (padMode.kind === "armed") {
        const action = ["b", "d", "a", "c", "g"].includes(key)
          ? (["goal", "defense", "save", "own_goal", "gk_in"] as const)[
              ["b", "d", "a", "c", "g"].indexOf(key)
            ]
          : null;
        if (action) {
          nativeEvent.preventDefault();
          onAction(action);
        }
        return;
      }

      // Mode au repos : un chiffre désigne un joueur, « a » et « z » créditent
      // directement un arrêt au gardien de gauche ou de droite.
      const participantId = participantByKey.get(key);
      if (participantId !== undefined) {
        nativeEvent.preventDefault();
        setPadMode({ kind: "armed", participantId });
        return;
      }
      if (key === "a" && match) {
        nativeEvent.preventDefault();
        onQuickSave(match.teamAId);
        return;
      }
      if (key === "z" && match) {
        nativeEvent.preventDefault();
        onQuickSave(match.teamBId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    padMode,
    participantByKey,
    onAction,
    onAssist,
    onQuickSave,
    store,
    match,
    capturable,
  ]);

  // --- Enchaînement des matchs ----------------------------------------------

  const session = useMemo(
    () =>
      aggregateSession(
        sheet.matches.map((item) => ({
          id: item.id,
          teamAId: item.teamAId,
          teamBId: item.teamBId,
        })),
        domainEvents,
      ),
    [sheet.matches, domainEvents],
  );

  const suggestion = useMemo(() => {
    const finished = sheet.matches.filter((item) => item.status === "finished");
    const last = finished[finished.length - 1];
    const teamIds = sheet.teams.map((team) => team.id);
    if (teamIds.length < 2) return null;
    if (!last) return { teamAId: teamIds[0]!, teamBId: teamIds[1]! };

    const summary = session.matches.find((item) => item.matchId === last.id);
    const scoreA = summary?.scoreA ?? 0;
    const scoreB = summary?.scoreB ?? 0;
    // Le vainqueur reste ; à égalité, l'équipe entrante reste (MATCH-001).
    const staying = scoreA > scoreB ? last.teamAId : last.teamBId;
    const rested = teamIds.find((id) => id !== last.teamAId && id !== last.teamBId);
    const incoming = rested ?? teamIds.find((id) => id !== staying) ?? teamIds[0]!;
    return { teamAId: staying, teamBId: incoming };
  }, [sheet.matches, sheet.teams, session]);

  const warnings = useMemo(
    () =>
      match
        ? checkMatch(
            {
              id: match.id,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              status: match.status,
              declaredScoreA: match.declaredScoreA,
              declaredScoreB: match.declaredScoreB,
            },
            domainEvents,
          )
        : [],
    [match, domainEvents],
  );

  const published = sheet.session.status === "published";

  return (
    <div className="space-y-3">
      <TopBar
        sheet={sheet}
        syncState={store.syncState}
        pendingCount={store.pendingCount}
        onRetry={() => void store.flush()}
      />

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* --- Colonne vidéo -------------------------------------------- */}
        <div className="space-y-3">
          <VideoDeck
            ref={deck}
            url={sheet.session.videoUrl}
            onTimeUpdate={setVideoMs}
            onReadyChange={setVideoReady}
          />

          <Journal
            events={store.events.filter((event) => event.matchId === match?.id)}
            sheet={sheet}
            onSeek={(ms) => deck.current?.seekTo(ms)}
            onDelete={store.remove}
            disabled={published}
          />
        </div>

        {/* --- Colonne saisie ------------------------------------------- */}
        <div className="space-y-3">
          <nav className="flex gap-1.5" aria-label="Sections de la feuille">
            {(
              [
                { id: "capture", label: "Saisie", icon: ListOrdered },
                { id: "roster", label: "Composition", icon: Users },
                { id: "summary", label: "Bilan", icon: Trophy },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={tab === item.id}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                  tab === item.id
                    ? "bg-accent text-background"
                    : "bg-surface text-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" aria-hidden />
                {item.label}
              </button>
            ))}
          </nav>

          {tab === "capture" && (
            <Card className="space-y-3">
              {match && teamA && teamB && aggregate ? (
                <>
                  <MatchHeader
                    sheet={sheet}
                    match={match}
                    scoreA={aggregate.scoreA}
                    scoreB={aggregate.scoreB}
                    clockMs={clockMs}
                    videoReady={videoReady}
                    disabled={published}
                    onSelect={setSelectedMatchId}
                    onKickOff={() =>
                      void run(() =>
                        updateMatch.mutateAsync({
                          matchId: match.id,
                          status: "playing",
                          videoStartMs: deck.current?.currentMs() ?? 0,
                        }),
                      )
                    }
                    onFinish={() => {
                      void (async () => {
                        // La file part avant la clôture : la feuille renvoyée
                        // par le serveur contient alors tout ce qui a été
                        // relevé, sans qu'une réponse en retard ne masque
                        // momentanément les dernières actions.
                        await store.flush();
                        await run(() =>
                          updateMatch.mutateAsync({
                            matchId: match.id,
                            status: "finished",
                          }),
                        );
                      })();
                    }}
                    onDeclaredScore={(side, value) =>
                      void run(() =>
                        updateMatch.mutateAsync({
                          matchId: match.id,
                          ...(side === "a"
                            ? { declaredScoreA: value }
                            : { declaredScoreB: value }),
                        }),
                      )
                    }
                    onRemove={() =>
                      void run(() => removeMatch.mutateAsync({ matchId: match.id }))
                    }
                  />

                  {warnings.map((warning, index) => (
                    <p
                      key={index}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-[11px]",
                        warning.level === "blocking"
                          ? "bg-error/15 text-red-200"
                          : "bg-warning/10 text-amber-200",
                      )}
                    >
                      {warning.message}
                    </p>
                  ))}

                  <CapturePad
                    mode={padMode}
                    teamA={teamA}
                    teamB={teamB}
                    rosterA={rosterA}
                    rosterB={rosterB}
                    statsByParticipant={statsByParticipant}
                    goalkeepers={goalkeepers}
                    keyByParticipant={keyByParticipant}
                    onArm={(participantId) =>
                      setPadMode({ kind: "armed", participantId })
                    }
                    onAction={onAction}
                    onAssist={onAssist}
                    onQuickSave={onQuickSave}
                    onCancel={() => setPadMode({ kind: "idle" })}
                    onUndo={() => {
                      store.undo();
                      setPadMode({ kind: "idle" });
                    }}
                    canUndo={store.canUndo}
                    disabled={published || match.status === "pending"}
                  />

                  {match.status === "pending" && (
                    <p className="text-center text-[11px] text-muted">
                      Placez la vidéo sur le coup d'envoi, puis appuyez sur
                      « Coup d'envoi ici » : l'horloge du match en découlera.
                    </p>
                  )}
                </>
              ) : (
                <NoMatchYet
                  sheet={sheet}
                  suggestion={suggestion}
                  disabled={published}
                  onAdd={(teamAId, teamBId) =>
                    void run(() =>
                      addMatch.mutateAsync({
                        sessionId,
                        teamAId,
                        teamBId,
                      }),
                    )
                  }
                />
              )}
            </Card>
          )}

          {tab === "capture" && match?.status === "finished" && suggestion && !published && (
            <Card className="space-y-2">
              <p className="text-xs font-medium text-muted">Match suivant</p>
              <p className="text-sm">
                {sheet.teams.find((team) => team.id === suggestion.teamAId)?.name}{" "}
                contre{" "}
                {sheet.teams.find((team) => team.id === suggestion.teamBId)?.name}
                <span className="ml-1 text-[11px] text-muted">
                  (le vainqueur reste)
                </span>
              </p>
              <Button
                variant="accent"
                fullWidth
                loading={addMatch.isPending}
                onClick={async () => {
                  await run(() =>
                    addMatch.mutateAsync({
                      sessionId,
                      teamAId: suggestion.teamAId,
                      teamBId: suggestion.teamBId,
                    }),
                  );
                  setSelectedMatchId(null);
                }}
              >
                Enchaîner
              </Button>
            </Card>
          )}

          {tab === "roster" && (
            <Card>
              <RosterPanel sheet={sheet} onChanged={onChanged} />
            </Card>
          )}

          {tab === "summary" && (
            <>
              <Card>
                <SessionSummary sheet={sheet} />
              </Card>
              <PublishPanel sheet={sheet} onChanged={onChanged} />
            </>
          )}

          <button
            type="button"
            onClick={() => setShowKeys((value) => !value)}
            className="flex w-full items-center justify-center gap-1.5 text-[11px] text-muted hover:text-foreground"
          >
            <Keyboard className="size-3.5" aria-hidden />
            {showKeys ? "Masquer" : "Afficher"} les raccourcis clavier
          </button>

          {showKeys && <ShortcutHelp />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({
  sheet,
  syncState,
  pendingCount,
  onRetry,
}: {
  sheet: TrackerSheet;
  syncState: "idle" | "pending" | "syncing" | "error";
  pendingCount: number;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {sheet.session.label}
        </h1>
        <p className="text-xs text-muted">
          {sheet.session.localDate}
          {sheet.session.venueName ? ` · ${sheet.session.venueName}` : ""}
          {sheet.session.division ? ` · ${sheet.session.division}` : ""}
          {" · "}
          {sheet.participants.length} joueurs · {sheet.matches.length} match(s)
        </p>
      </div>

      {sheet.session.status === "published" ? (
        <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs text-emerald-300">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Publiée
        </span>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
            syncState === "error"
              ? "bg-error/15 text-red-200"
              : syncState === "idle"
                ? "bg-success/15 text-emerald-300"
                : "bg-surface text-muted",
          )}
        >
          {syncState === "syncing" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : syncState === "error" ? (
            <CloudOff className="size-3.5" aria-hidden />
          ) : syncState === "idle" ? (
            <CheckCircle2 className="size-3.5" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {syncState === "idle"
            ? "Enregistré"
            : syncState === "error"
              ? `${pendingCount} en attente — réessayer`
              : `${pendingCount} en attente`}
        </button>
      )}
    </div>
  );
}

function MatchHeader({
  sheet,
  match,
  scoreA,
  scoreB,
  clockMs,
  videoReady,
  disabled,
  onSelect,
  onKickOff,
  onFinish,
  onDeclaredScore,
  onRemove,
}: {
  sheet: TrackerSheet;
  match: TrackerMatchView;
  scoreA: number;
  scoreB: number;
  clockMs: number;
  videoReady: boolean;
  disabled: boolean;
  onSelect: (matchId: number) => void;
  onKickOff: () => void;
  onFinish: () => void;
  onDeclaredScore: (side: "a" | "b", value: number | null) => void;
  onRemove: () => void;
}) {
  const teamA = sheet.teams.find((team) => team.id === match.teamAId);
  const teamB = sheet.teams.find((team) => team.id === match.teamBId);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {sheet.matches.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
              item.id === match.id
                ? "bg-accent text-background"
                : item.status === "finished"
                  ? "bg-surface-raised text-muted"
                  : "bg-surface-raised text-foreground",
            )}
          >
            M{item.matchOrder}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <TeamScore name={teamA?.name ?? "A"} color={teamA?.color ?? "#fff"} score={scoreA} />
        <div className="text-center">
          <p className="font-mono text-2xl font-bold tabular-nums">
            {formatMatchClock(clockMs)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            {match.status === "pending"
              ? "à démarrer"
              : match.status === "playing"
                ? "en saisie"
                : "terminé"}
          </p>
        </div>
        <TeamScore name={teamB?.name ?? "B"} color={teamB?.color ?? "#fff"} score={scoreB} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {match.status === "pending" && (
          <Button
            variant="accent"
            className="min-h-[38px] flex-1 px-3 py-2 text-sm"
            disabled={disabled || !videoReady}
            onClick={onKickOff}
            title={
              videoReady ? undefined : "Ouvrez d'abord l'enregistrement du match"
            }
          >
            Coup d'envoi ici
          </Button>
        )}
        {match.status === "playing" && (
          <Button
            variant="secondary"
            className="min-h-[38px] flex-1 px-3 py-2 text-sm"
            disabled={disabled}
            onClick={onFinish}
            icon={<Flag className="size-4" aria-hidden />}
          >
            Terminer le match
          </Button>
        )}
        {match.status === "finished" && (
          <div className="flex flex-1 items-center gap-1.5">
            <label className="text-[11px] text-muted" htmlFor={`declared-${match.id}`}>
              Score au tableau
            </label>
            <input
              id={`declared-${match.id}`}
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              aria-label={`Score relevé de ${teamA?.name}`}
              value={match.declaredScoreA ?? ""}
              onChange={(event) =>
                onDeclaredScore(
                  "a",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              className="w-12 rounded-lg border border-border bg-surface-raised px-1 py-1 text-center text-sm tabular-nums"
            />
            <span className="text-muted">—</span>
            <input
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              aria-label={`Score relevé de ${teamB?.name}`}
              value={match.declaredScoreB ?? ""}
              onChange={(event) =>
                onDeclaredScore(
                  "b",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              className="w-12 rounded-lg border border-border bg-surface-raised px-1 py-1 text-center text-sm tabular-nums"
            />
          </div>
        )}

        <button
          type="button"
          aria-label={`Supprimer le match ${match.matchOrder}`}
          disabled={disabled}
          onClick={onRemove}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-red-300 disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TeamScore({
  name,
  color,
  score,
}: {
  name: string;
  color: string;
  score: number;
}) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="flex items-center justify-center gap-1.5 truncate text-xs font-medium">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        {name}
      </p>
      <p className="text-3xl font-bold tabular-nums">{score}</p>
    </div>
  );
}

function NoMatchYet({
  sheet,
  suggestion,
  disabled,
  onAdd,
}: {
  sheet: TrackerSheet;
  suggestion: { teamAId: number; teamBId: number } | null;
  disabled: boolean;
  onAdd: (teamAId: number, teamBId: number) => void;
}) {
  if (sheet.participants.length === 0) {
    return (
      <div className="space-y-2 py-6 text-center">
        <Users className="mx-auto size-7 text-muted" aria-hidden />
        <p className="text-sm text-muted">
          Composez d'abord les équipes dans l'onglet « Composition ».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4 text-center">
      <p className="text-sm text-muted">Aucun match ouvert.</p>
      {suggestion && (
        <Button
          variant="accent"
          fullWidth
          disabled={disabled}
          onClick={() => onAdd(suggestion.teamAId, suggestion.teamBId)}
        >
          Ouvrir{" "}
          {sheet.teams.find((team) => team.id === suggestion.teamAId)?.name} contre{" "}
          {sheet.teams.find((team) => team.id === suggestion.teamBId)?.name}
        </Button>
      )}
    </div>
  );
}

function Journal({
  events,
  sheet,
  onSeek,
  onDelete,
  disabled,
}: {
  events: TrackerEventView[];
  sheet: TrackerSheet;
  onSeek: (ms: number) => void;
  onDelete: (clientId: string) => void;
  disabled: boolean;
}) {
  const nameOf = (participantId: number | null): string =>
    participantId === null
      ? ""
      : (sheet.participants.find((player) => player.id === participantId)
          ?.displayName ?? "—");

  const ordered = [...events].sort((a, b) => b.clockMs - a.clockMs);

  return (
    <Card className="space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Journal du match
      </h2>

      {ordered.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-muted">
          Aucune action relevée pour l'instant.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {ordered.map((event) => {
            const action = trackerAction(event.type as TrackerEventType);
            const team = sheet.teams.find((item) => item.id === event.teamId);
            return (
              <li
                key={event.clientId}
                className="flex items-center gap-2 rounded-lg bg-surface-raised px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => event.videoMs != null && onSeek(event.videoMs)}
                  disabled={event.videoMs == null}
                  title={
                    event.videoMs == null
                      ? "Aucun timecode"
                      : "Revoir cette action"
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                >
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {formatMatchClock(event.clockMs)}
                  </span>
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: team?.color ?? "#94a3b8" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    <span className="font-medium">{action.short}</span>{" "}
                    {nameOf(event.participantId)}
                    {event.assistParticipantId !== null && (
                      <span className="text-muted">
                        {" "}
                        · passe {nameOf(event.assistParticipantId)}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Supprimer cette action"
                  disabled={disabled}
                  onClick={() => onDelete(event.clientId)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:text-red-300 disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SessionSummary({ sheet }: { sheet: TrackerSheet }) {
  const events: TrackerEvent[] = sheet.events.map((event) => ({
    clientId: event.clientId,
    matchId: event.matchId,
    type: event.type as TrackerEventType,
    participantId: event.participantId,
    assistParticipantId: event.assistParticipantId,
    teamId: event.teamId,
    clockMs: event.clockMs,
    videoMs: event.videoMs,
  }));

  const aggregate = aggregateSession(
    sheet.matches.map((match) => ({
      id: match.id,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    })),
    events,
  );

  const nameOf = (participantId: number): string =>
    sheet.participants.find((player) => player.id === participantId)?.displayName ??
    "—";

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Classement de la session
      </h2>
      {aggregate.participants.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-muted">
          Rien de relevé pour l'instant.
        </p>
      ) : (
        <ol className="space-y-1">
          {aggregate.participants.map((line, index) => (
            <li
              key={line.participantId}
              className="flex items-center gap-2 rounded-lg bg-surface-raised px-2 py-1.5 text-[12px]"
            >
              <span className="w-5 shrink-0 text-center font-semibold tabular-nums text-muted">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {nameOf(line.participantId)}
                  {line.participantId === aggregate.motmParticipantId && (
                    <span className="ml-1 text-accent">★</span>
                  )}
                </span>
                <span className="block text-[10px] text-muted">
                  {line.goals}B · {line.assists}P · {line.defenses}D ·{" "}
                  {line.saves}A
                  {line.concededGoals > 0 && ` · ${line.concededGoals} encaissé(s)`}
                  {line.ownGoals > 0 && ` · ${line.ownGoals} csc`}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatPoints(line.points)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ShortcutHelp() {
  const rows: [string, string][] = [
    ["1 … 0", "désigner un joueur (le chiffre est sur sa pastille)"],
    ["B / D / A / C / G", "but · défense · arrêt · csc · entre au but"],
    ["A / Z", "arrêt du gardien de gauche / de droite, sans rien désigner"],
    ["Entrée", "but sans passe décisive"],
    ["Espace", "lecture ou pause"],
    ["← / →", "reculer ou avancer de 3 s (Maj : 1 s)"],
    ["Ctrl + Z", "annuler la dernière action"],
    ["Échap", "abandonner la sélection en cours"],
  ];

  return (
    <Card className="space-y-1">
      {rows.map(([keys, meaning]) => (
        <p key={keys} className="flex gap-2 text-[11px]">
          <kbd className="w-32 shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-center text-muted">
            {keys}
          </kbd>
          <span className="text-muted">{meaning}</span>
        </p>
      ))}
    </Card>
  );
}
