import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  FileVideo,
  Pause,
  Play,
  Rewind,
  FastForward,
  Gauge,
} from "lucide-react";
import type { TrackerVideo } from "@uno/shared";
import { cn } from "@/lib/cn.js";

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

interface VideoDeckProps {
  /** Enregistrements de la feuille. Une entrée sans `url` attend son fichier. */
  videos: TrackerVideo[];
  /** Enregistrement affiché ; `null` tant que la feuille n'en a aucun. */
  currentId: number | null;
  onSelect: (videoId: number) => void;
  onTimeUpdate: (ms: number) => void;
  onReadyChange: (ready: boolean) => void;
}

export const VideoDeck = forwardRef<VideoDeckHandle, VideoDeckProps>(
  function VideoDeck(
    { videos, currentId, onSelect, onTimeUpdate, onReadyChange },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
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

    // Une URL d'objet non révoquée retient le fichier en mémoire tant que
    // l'onglet vit : sur des enregistrements d'une heure, cela se voit.
    useEffect(
      () => () => {
        for (const url of objectUrls.current) URL.revokeObjectURL(url);
      },
      [],
    );

    const openFile = useCallback(
      (file: File, videoId: number) => {
        const next = URL.createObjectURL(file);
        objectUrls.current.push(next);
        setLocalFiles((files) => ({ ...files, [videoId]: next }));
        setFileNames((names) => ({ ...names, [videoId]: file.name }));
      },
      [],
    );

    useImperativeHandle(
      ref,
      (): VideoDeckHandle => ({
        currentMs: () => Math.round((videoRef.current?.currentTime ?? 0) * 1000),
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
      }, 250);
      return () => window.clearInterval(timer);
    }, [playing, onTimeUpdate]);

    useEffect(() => {
      onReadyChange(source !== null);
    }, [source, onReadyChange]);

    const announce = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      const ms = Math.round(video.currentTime * 1000);
      setPosition(ms);
      onTimeUpdate(ms);
    }, [onTimeUpdate]);

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
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onSeeked={announce}
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
            <label
              className={cn(
                "flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-3",
                "px-6 text-center text-sm text-muted",
              )}
            >
              <FileVideo className="size-8" aria-hidden />
              <span className="font-medium text-foreground">
                {current
                  ? `Ouvrez « ${current.label} »`
                  : "Ajoutez un enregistrement à la feuille"}
              </span>
              <span className="max-w-sm text-xs">
                {current
                  ? "Glissez le fichier ici, ou cliquez pour le choisir. La vidéo reste sur votre appareil : rien n'est envoyé."
                  : "Un fichier depuis votre disque, ou l'adresse d'une vidéo déjà en ligne."}
              </span>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && current) openFile(file, current.id);
                }}
              />
            </label>
          )}
        </div>

        {source && (
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              value={Math.min(position, duration || position)}
              aria-label="Position dans l'enregistrement"
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
                label="Reculer de 10 secondes"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime = Math.max(0, video.currentTime - 10);
                  announce();
                }}
              >
                <Rewind className="size-4" aria-hidden />
                10s
              </DeckButton>
              <DeckButton
                label="Reculer de 3 secondes"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime = Math.max(0, video.currentTime - 3);
                  announce();
                }}
              >
                −3s
              </DeckButton>
              <DeckButton
                label={playing ? "Pause" : "Lecture"}
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
                label="Avancer de 3 secondes"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime += 3;
                  announce();
                }}
              >
                +3s
              </DeckButton>
              <DeckButton
                label="Avancer de 10 secondes"
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
                  aria-label="Vitesse de lecture"
                  value={speed}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSpeed(value);
                    if (videoRef.current) videoRef.current.playbackRate = value;
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
