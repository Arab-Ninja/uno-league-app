import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftRight,
  FileVideo,
  Pause,
  Play,
  Rewind,
  FastForward,
  Gauge,
} from "lucide-react";
import type { TrackerVideo } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";

/**
 * Lecteur de visionnage (TRACK-001).
 *
 * Il ne cherche pas à être un lecteur complet : il rend possibles les trois
 * gestes d'une saisie sur enregistrement — s'arrêter sur l'action, revenir
 * quelques secondes en arrière, ralentir pour identifier un joueur.
 *
 * L'enregistrement est ouvert **depuis le disque** et ne quitte jamais
 * l'appareil : aucun téléversement, aucune attente, et un fichier d'une heure
 * s'ouvre instantanément. Une adresse reste possible pour une vidéo déjà
 * hébergée.
 *
 * **Une séance peut en compter plusieurs.** Deux heures de futsal se filment
 * rarement d'une traite. Le lecteur reçoit donc la liste des enregistrements
 * de la feuille et laisse passer de l'un à l'autre ; les fichiers ouverts
 * depuis le disque sont retenus le temps de la visite, de sorte qu'un
 * aller-retour entre la première et la seconde heure ne les redemande pas.
 *
 * **Deux angles, lus ensemble.** Un terrain filmé par deux caméras se saisit
 * mieux en regardant les deux : ce que l'une voit de loin, l'autre le voit de
 * près. Le second angle se cale une fois sur le premier (le même geste dans
 * les deux), puis suit chaque lecture, pause, saut et ralenti. Le timecode
 * d'une action reste celui de la vidéo principale.
 *
 * Le temps affiché est rafraîchi quatre fois par seconde — assez pour suivre
 * l'action sans redessiner l'écran de saisie à chaque image. Le timecode
 * réellement enregistré avec une action, lui, est lu à l'instant du geste sur
 * l'élément vidéo : il est exact, quelle que soit la cadence d'affichage.
 */

export interface VideoDeckHandle {
  /** Position courante en millisecondes, lue à l'instant de l'appel. */
  currentMs: () => number;
  seekTo: (ms: number) => void;
  seekBy: (deltaMs: number) => void;
  toggle: () => void;
  pause: () => void;
  isReady: () => boolean;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

/** Au-delà, le second angle est replacé : en deçà, la lecture le laisse filer. */
const DRIFT_S = 0.15;

interface VideoDeckProps {
  /** Enregistrements de la feuille. Une entrée sans `url` attend son fichier. */
  videos: TrackerVideo[];
  /** Enregistrement affiché ; `null` tant que la feuille n'en a aucun. */
  currentId: number | null;
  onSelect: (videoId: number) => void;
  onTimeUpdate: (ms: number) => void;
  onReadyChange: (ready: boolean) => void;
  /** Second angle lu en même temps ; `null` : aucun. */
  companionId?: number | null;
  /** `t(second angle) − t(principal)`, en millisecondes. */
  companionDeltaMs?: number;
  onCompanionChange?: (videoId: number | null) => void;
  /** Décale le second angle de `deltaMs` par rapport au principal. */
  onShiftCompanion?: (deltaMs: number) => void;
  /** Échange le principal et le second angle. */
  onSwap?: () => void;
}

export const VideoDeck = forwardRef<VideoDeckHandle, VideoDeckProps>(
  function VideoDeck(
    {
      videos,
      currentId,
      onSelect,
      onTimeUpdate,
      onReadyChange,
      companionId = null,
      companionDeltaMs = 0,
      onCompanionChange,
      onShiftCompanion,
      onSwap,
    },
    ref,
  ) {
    const t = useT();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const companionRef = useRef<HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<number>(1);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [dragging, setDragging] = useState(false);

    /**
     * Fichiers locaux ouverts pendant cette visite, par enregistrement.
     *
     * Ils ne peuvent pas être mémorisés d'une visite à l'autre — un fichier
     * n'a pas d'adresse — mais les garder ici évite de les redemander à chaque
     * aller-retour entre la première et la seconde heure.
     */
    const [localFiles, setLocalFiles] = useState<Record<number, string>>({});
    const [fileNames, setFileNames] = useState<Record<number, string>>({});
    const objectUrls = useRef<string[]>([]);

    const current = videos.find((video) => video.id === currentId) ?? null;
    const source = current
      ? (current.url ?? localFiles[current.id] ?? null)
      : null;
    const fileName = current ? (fileNames[current.id] ?? null) : null;

    const companion =
      companionId !== null && companionId !== currentId
        ? (videos.find((video) => video.id === companionId) ?? null)
        : null;
    const companionSource = companion
      ? (companion.url ?? localFiles[companion.id] ?? null)
      : null;

    // Une URL d'objet non révoquée retient le fichier en mémoire tant que
    // l'onglet vit : sur des enregistrements d'une heure, cela se voit.
    useEffect(
      () => () => {
        for (const url of objectUrls.current) URL.revokeObjectURL(url);
      },
      [],
    );

    const openFile = useCallback((file: File, videoId: number) => {
      const next = URL.createObjectURL(file);
      objectUrls.current.push(next);
      setLocalFiles((files) => ({ ...files, [videoId]: next }));
      setFileNames((names) => ({ ...names, [videoId]: file.name }));
    }, []);

    /**
     * Place le second angle au même instant que le principal. Il ne bouge que
     * s'il a dérivé : le replacer à chaque rafraîchissement le ferait saccader.
     */
    const syncCompanion = useCallback(
      (force = false) => {
        const main = videoRef.current;
        const other = companionRef.current;
        if (!main || !other) return;
        const target = main.currentTime + companionDeltaMs / 1000;
        if (target < 0) {
          if (!other.paused) other.pause();
          other.currentTime = 0;
          return;
        }
        if (force || Math.abs(other.currentTime - target) > DRIFT_S) {
          other.currentTime = target;
        }
        if (other.playbackRate !== main.playbackRate) {
          other.playbackRate = main.playbackRate;
        }
        if (main.paused && !other.paused) other.pause();
        if (!main.paused && other.paused) void other.play().catch(() => {});
      },
      [companionDeltaMs],
    );

    // Un nouveau calage, un nouvel angle : on replace aussitôt.
    useEffect(() => {
      syncCompanion(true);
    }, [syncCompanion, companionSource]);

    useImperativeHandle(
      ref,
      (): VideoDeckHandle => ({
        currentMs: () =>
          Math.round((videoRef.current?.currentTime ?? 0) * 1000),
        seekTo: (ms) => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = Math.max(0, ms / 1000);
        },
        seekBy: (deltaMs) => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = Math.max(0, video.currentTime + deltaMs / 1000);
        },
        toggle: () => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play();
          else video.pause();
        },
        pause: () => videoRef.current?.pause(),
        isReady: () => videoRef.current !== null && source !== null,
      }),
      [source],
    );

    // Rafraîchissement du temps : quatre fois par seconde, uniquement en
    // lecture. À l'arrêt, `seeked` suffit.
    useEffect(() => {
      if (!playing) return;
      const timer = window.setInterval(() => {
        const video = videoRef.current;
        if (!video) return;
        const ms = Math.round(video.currentTime * 1000);
        setPosition(ms);
        onTimeUpdate(ms);
        syncCompanion();
      }, 250);
      return () => window.clearInterval(timer);
    }, [playing, onTimeUpdate, syncCompanion]);

    useEffect(() => {
      onReadyChange(source !== null);
    }, [source, onReadyChange]);

    const announce = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      const ms = Math.round(video.currentTime * 1000);
      setPosition(ms);
      onTimeUpdate(ms);
      syncCompanion(true);
    }, [onTimeUpdate, syncCompanion]);

    const others = videos.filter((video) => video.id !== currentId);
    const twoUp = companion !== null;

    return (
      <div className="space-y-2">
        {videos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {videos.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => onSelect(video.id)}
                aria-pressed={video.id === currentId}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  video.id === currentId
                    ? "bg-accent text-background"
                    : "bg-surface text-muted hover:text-foreground",
                )}
              >
                {video.label}
                {/* Un fichier local encore à ouvrir : le dire évite de croire
                    à un enregistrement vide. */}
                {video.url === null && !localFiles[video.id] && " · à ouvrir"}
              </button>
            ))}
          </div>
        )}

        <div className={cn("grid gap-2", twoUp && "sm:grid-cols-2")}>
          <div className="space-y-1">
            {twoUp && current && (
              <p className="truncate text-[11px] font-medium text-accent">
                {t("tracker.mainAngle", { name: current.label })}
              </p>
            )}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file && current) openFile(file, current.id);
              }}
              className={cn(
                "relative overflow-hidden rounded-card border bg-black",
                dragging ? "border-accent" : "border-border/60",
              )}
            >
              {source ? (
                <video
                  ref={videoRef}
                  src={source}
                  className="aspect-video w-full bg-black"
                  onPlay={() => {
                    setPlaying(true);
                    syncCompanion(true);
                  }}
                  onPause={() => {
                    setPlaying(false);
                    syncCompanion(true);
                  }}
                  onSeeked={announce}
                  onRateChange={() => syncCompanion()}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    setDuration(Math.round(video.duration * 1000) || 0);
                    video.playbackRate = speed;
                  }}
                  onClick={(event) => {
                    const video = event.currentTarget;
                    if (video.paused) void video.play();
                    else video.pause();
                  }}
                />
              ) : (
                <FilePicker
                  label={
                    current
                      ? t("tracker.openNamed", { name: current.label })
                      : t("tracker.addRecordingFirst")
                  }
                  hint={
                    current ? t("tracker.dropHint") : t("tracker.sourceHint")
                  }
                  onFile={(file) => current && openFile(file, current.id)}
                />
              )}
            </div>
          </div>

          {companion && (
            <div className="space-y-1">
              <p className="truncate text-[11px] font-medium text-muted">
                {t("tracker.secondAngle", { name: companion.label })}
              </p>
              <div className="relative overflow-hidden rounded-card border border-border/60 bg-black">
                {companionSource ? (
                  <video
                    ref={companionRef}
                    src={companionSource}
                    muted
                    playsInline
                    className="aspect-video w-full bg-black"
                    onLoadedMetadata={() => syncCompanion(true)}
                  />
                ) : (
                  <FilePicker
                    label={t("tracker.openNamed", { name: companion.label })}
                    hint={t("tracker.dropHint")}
                    onFile={(file) => openFile(file, companion.id)}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {source && (
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              value={Math.min(position, duration || position)}
              aria-label={t("tracker.position")}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) return;
                video.currentTime = Number(event.target.value) / 1000;
                announce();
              }}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              <DeckButton
                label={t("tracker.back10")}
                onClick={() => {
                  const video = videoRef.current;
                  if (video)
                    video.currentTime = Math.max(0, video.currentTime - 10);
                  announce();
                }}
              >
                <Rewind className="size-4" aria-hidden />
                10s
              </DeckButton>
              <DeckButton
                label={t("tracker.back3")}
                onClick={() => {
                  const video = videoRef.current;
                  if (video)
                    video.currentTime = Math.max(0, video.currentTime - 3);
                  announce();
                }}
              >
                −3s
              </DeckButton>
              <DeckButton
                label={playing ? t("tracker.pause") : t("tracker.play")}
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) void video.play();
                  else video.pause();
                }}
                emphasis
              >
                {playing ? (
                  <Pause className="size-4" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
              </DeckButton>
              <DeckButton
                label={t("tracker.forward3")}
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime += 3;
                  announce();
                }}
              >
                +3s
              </DeckButton>
              <DeckButton
                label={t("tracker.forward10")}
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime += 10;
                  announce();
                }}
              >
                <FastForward className="size-4" aria-hidden />
                10s
              </DeckButton>

              <div className="ml-auto flex items-center gap-1.5">
                <Gauge className="size-4 text-muted" aria-hidden />
                <select
                  aria-label={t("tracker.speed")}
                  value={speed}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSpeed(value);
                    if (videoRef.current) videoRef.current.playbackRate = value;
                    if (companionRef.current)
                      companionRef.current.playbackRate = value;
                  }}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
                >
                  {SPEEDS.map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {onCompanionChange && others.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-border/60 bg-surface px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="text-[11px] text-muted" htmlFor="angle-2">
                    {t("tracker.secondAngleLabel")}
                  </label>
                  <select
                    id="angle-2"
                    value={companion?.id ?? ""}
                    onChange={(event) =>
                      onCompanionChange(
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                    className="rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs"
                  >
                    <option value="">{t("tracker.noSecondAngle")}</option>
                    {others.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.label}
                      </option>
                    ))}
                  </select>
                  {companion && onSwap && (
                    <button
                      type="button"
                      onClick={onSwap}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-surface-raised hover:text-foreground"
                    >
                      <ArrowLeftRight className="size-3.5" aria-hidden />
                      {t("tracker.swapAngles")}
                    </button>
                  )}
                </div>

                {companion && onShiftCompanion && (
                  <>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[11px] text-muted">
                        {t("tracker.angleOffset")}
                      </span>
                      {[-1000, -100].map((step) => (
                        <ShiftButton
                          key={step}
                          step={step}
                          onShift={onShiftCompanion}
                        />
                      ))}
                      <span className="min-w-[4.5rem] text-center font-mono text-xs tabular-nums">
                        {formatOffset(companionDeltaMs)}
                      </span>
                      {[100, 1000].map((step) => (
                        <ShiftButton
                          key={step}
                          step={step}
                          onShift={onShiftCompanion}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted">
                      {t("tracker.angleOffsetHint")}
                    </p>
                  </>
                )}
              </div>
            )}

            {fileName && (
              <p className="truncate text-[11px] text-muted" title={fileName}>
                {fileName}
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);

/** « +3,4 s », « −0,5 s » : le décalage du second angle, tel qu'on le règle. */
function formatOffset(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "";
  return `${sign}${Math.abs(seconds).toFixed(1).replace(".", ",")} s`;
}

function ShiftButton({
  step,
  onShift,
}: {
  step: number;
  onShift: (deltaMs: number) => void;
}) {
  const label = `${step > 0 ? "+" : "−"}${Math.abs(step) >= 1000 ? "1" : "0,1"} s`;
  return (
    <button
      type="button"
      onClick={() => onShift(step)}
      className="min-h-[32px] rounded-lg bg-surface-raised px-2 text-[11px] font-medium hover:bg-background"
    >
      {label}
    </button>
  );
}

function FilePicker({
  label,
  hint,
  onFile,
}: {
  label: string;
  hint: string;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={cn(
        "flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-3",
        "px-6 text-center text-sm text-muted",
      )}
    >
      <FileVideo className="size-8" aria-hidden />
      <span className="font-medium text-foreground">{label}</span>
      <span className="max-w-sm text-xs">{hint}</span>
      <input
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function DeckButton({
  label,
  onClick,
  children,
  emphasis,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex min-h-[38px] items-center gap-1 rounded-lg px-3 text-xs font-medium transition-colors",
        emphasis
          ? "bg-accent text-background hover:brightness-110"
          : "bg-surface-raised text-foreground hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}
