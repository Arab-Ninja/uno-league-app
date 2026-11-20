import { useEffect, useMemo, useRef, useState } from "react";
import {
  CirclePlay,
  Clock,
  Crosshair,
  ExternalLink,
  FileJson,
  Film,
  Flag,
  Goal,
  Hand,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  LIMITS,
  VIDEO_UPLOAD,
  embedAt,
  parseMomentsDocument,
  type SessionVideo,
  type VideoMoment,
  type VideoMomentKind,
  type VideoRole,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { UploadAborted, uploadParts } from "@/lib/video-upload.js";
import {
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  Select,
} from "@/components/ui/index.js";
import { useT, type Cle } from "@/lib/i18n.js";

/**
 * Vidéos d'une session (SUP-002, SUP-004).
 *
 * Deux sortes de vidéos :
 *  - **un lien** vers un hébergeur. Seule une adresse jouable fournie par le
 *    serveur est intégrée : un `<iframe>` exécute la page distante dans
 *    l'application, et le client ne décide jamais de ce qui y est chargé.
 *    Le serveur reconnaît YouTube et Vimeo et reconstruit l'adresse ; le
 *    reste est lu comme un fichier, ou ouvert en lien ;
 *  - **un fichier** déposé sur le stockage privé de la ligue (SUP-004) :
 *    l'adresse est signée par le serveur pour ce joueur, valable quelques
 *    heures.
 *
 * Une séance a au plus un **match complet** et un **résumé**. Le match
 * complet porte les **moments-clés** : buts, arrêts, coup d'envoi et fin ;
 * un geste sur l'un d'eux fait sauter la vidéo à cet instant.
 */

type Seek = { t: number; n: number } | null;

/** « 1:02:03 » ou « 12:05 ». */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** « 12:05 », « 1:02:03 » ou « 725 » en secondes ; `null` si illisible. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length === 0 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
}

function VideoFrame({
  video,
  seek = null,
  videoRef,
}: {
  video: SessionVideo;
  seek?: Seek;
  /** Pour lire l'instant affiché (« ajouter un moment ici »). */
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const t = useT();
  const local = useRef<HTMLVideoElement | null>(null);
  // L'adresse d'un fichier est gardée telle que reçue : une adresse signée
  // de nouveau à chaque rafraîchissement ferait repartir la lecture de zéro.
  // Elle ne change que si la première ne se lit plus (expirée).
  const [src, setSrc] = useState(video.url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = local.current;
    if (!seek || !el) return;
    el.currentTime = seek.t;
    void el.play().catch(() => undefined);
  }, [seek]);

  if (video.embedUrl) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
        <iframe
          // Un nouveau cadre à chaque saut : le lecteur repart à l'instant voulu.
          key={seek?.n ?? 0}
          src={
            seek
              ? embedAt(video.embedUrl, video.provider, seek.t)
              : video.embedUrl
          }
          title={
            video.label ??
            t("videos.videoOf", {
              provider: t(`videos.provider.${video.provider}`),
            })
          }
          className="aspect-video w-full"
          // Le cadre n'a droit qu'à ce qu'il faut pour lire une vidéo.
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  /**
   * Tout le reste est un **fichier vidéo**, joué sur place. Un `<video>`
   * n'exécute rien — contrairement à un cadre — et ne peut donc pas servir de
   * porte d'entrée à une page hostile, quelle que soit l'adresse. S'il n'en
   * tire rien, on retombe sur un lien plutôt que sur un rectangle noir.
   */
  if (!failed && src) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
        <video
          ref={(el) => {
            local.current = el;
            if (videoRef) videoRef.current = el;
          }}
          src={src}
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-black"
          onError={() => {
            if (video.url && video.url !== src) setSrc(video.url);
            else setFailed(true);
          }}
        />
      </div>
    );
  }

  if (video.source === "file") {
    return (
      <p className="rounded-xl border border-border/60 bg-surface-raised px-3 py-2.5 text-sm text-muted">
        {t("videos.unavailable")}
      </p>
    );
  }

  return (
    <a
      href={video.url}
      target="_blank"
      // `noreferrer` autant que `noopener` : la page ouverte n'a ni accès à
      // l'onglet d'origine, ni connaissance de sa provenance.
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-raised px-3 py-2.5 text-sm text-accent transition-colors hover:bg-surface"
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {video.label ?? t("videos.open")}
      </span>
    </a>
  );
}

const MOMENT_ICONS: Record<VideoMomentKind, typeof Goal> = {
  kickoff: CirclePlay,
  goal: Goal,
  save: Hand,
  shot: Crosshair,
  end: Flag,
  other: Star,
};

type MomentFilter = "all" | "goal" | "save" | "shot";

/** La liste des moments-clés : un geste, et la vidéo y saute. */
function MomentList({
  moments,
  onPick,
}: {
  moments: VideoMoment[];
  onPick: (moment: VideoMoment) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<MomentFilter>("all");
  const has = (kind: VideoMomentKind) => moments.some((m) => m.kind === kind);
  const filters: MomentFilter[] = [
    "all",
    ...(["goal", "save", "shot"] as const).filter((k) => has(k)),
  ];
  const shown =
    filter === "all" ? moments : moments.filter((m) => m.kind === filter);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <p className="text-sm font-semibold">{t("videos.moments")}</p>
        <p className="text-[11px] text-muted">{t("videos.momentsHint")}</p>
      </div>
      {filters.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {filters.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === key
                  ? "bg-accent text-background"
                  : "bg-surface text-muted hover:text-foreground",
              )}
            >
              {t(`videos.filter.${key}` as Cle)}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
        {shown.map((moment, index) => {
          const Icon = MOMENT_ICONS[moment.kind] ?? Star;
          return (
            <li key={`${moment.t}-${index}`}>
              <button
                type="button"
                onClick={() => onPick(moment)}
                className="flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-raised"
              >
                <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
                  {moment.minute !== null
                    ? `${moment.minute}'`
                    : formatClock(moment.t)}
                </span>
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    moment.kind === "goal" ? "text-accent" : "text-muted",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {moment.label}
                  </span>
                  {moment.detail && (
                    <span className="block truncate text-xs text-muted">
                      {moment.detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useVideoName() {
  const t = useT();
  return (video: SessionVideo, index: number) =>
    video.role
      ? t(`videos.role.${video.role}` as Cle)
      : (video.label ?? t("videos.videoN", { n: index + 1 }));
}

/**
 * Lecture seule : ce que voient les participants d'une session.
 *
 * **Une seule vidéo à l'écran** : le résumé d'abord, puis le match complet,
 * au choix d'un geste. Les moments-clés renvoient toujours au match complet,
 * même quand on regardait le résumé.
 */
export function SessionVideos({ videos }: { videos: SessionVideo[] }) {
  const t = useT();
  const name = useVideoName();
  const [current, setCurrent] = useState(0);
  const [seek, setSeek] = useState<Seek>(null);
  if (videos.length === 0) return null;

  const index = Math.min(current, videos.length - 1);
  const video = videos[index];
  if (!video) return null;

  const momentsIndex = videos.findIndex(
    (v) => v.role === "match" && v.moments.length > 0,
  );
  const momentsOwner =
    momentsIndex >= 0 ? momentsIndex : video.moments.length > 0 ? index : -1;
  const moments =
    momentsOwner >= 0 ? (videos[momentsOwner]?.moments ?? []) : [];

  return (
    <section className="space-y-2">
      <SectionTitle>
        {videos.length > 1 ? t("videos.titleMany") : t("videos.titleOne")}
      </SectionTitle>

      {videos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {videos.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setCurrent(i);
                setSeek(null);
              }}
              aria-pressed={i === index}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                i === index
                  ? "bg-accent text-background"
                  : "bg-surface text-muted hover:text-foreground",
              )}
            >
              {name(entry, i)}
            </button>
          ))}
        </div>
      )}

      <VideoFrame key={video.id} video={video} seek={seek} />
      <p className="px-1 text-[11px] text-muted">
        {name(video, index)}
        {video.addedBy && video.source === "link"
          ? t("videos.addedBy", { name: video.addedBy })
          : ""}
      </p>

      {moments.length > 0 && (
        <MomentList
          moments={moments}
          onPick={(moment) => {
            setCurrent(momentsOwner);
            setSeek((previous) => ({ t: moment.t, n: (previous?.n ?? 0) + 1 }));
          }}
        />
      )}
    </section>
  );
}

/**
 * Vidéos telles que les voit un participant, sur la page de sa session.
 *
 * `enabled` évite d'appeler une route qui répondrait « interdit » à un
 * visiteur ordinaire : ce n'est qu'une politesse d'interface. C'est le
 * serveur qui décide vraiment, et il refuse quoi qu'affiche l'écran.
 */
export function SessionVideoPanel({
  proposalId,
  enabled,
}: {
  proposalId: number;
  enabled: boolean;
}) {
  const videos = trpc.supervision.videos.useQuery(
    { proposalId },
    { enabled, retry: false },
  );

  if (!enabled || !videos.data || videos.data.length === 0) return null;
  return <SessionVideos videos={videos.data} />;
}

// ---------------------------------------------------------------------------
// La gestion, par l'administration
// ---------------------------------------------------------------------------

function sizeLabel(bytes: number): string {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go`
    : `${Math.max(1, Math.round(bytes / 1e6))} Mo`;
}

/** Envoyer le fichier d'un rôle, morceau par morceau, avec sa progression. */
function RoleFileUpload({
  proposalId,
  role,
  onDone,
}: {
  proposalId: number;
  role: VideoRole;
  onDone: () => Promise<void>;
}) {
  const t = useT();
  const start = trpc.supervision.startVideoUpload.useMutation();
  const complete = trpc.supervision.completeVideoUpload.useMutation();
  const abort = trpc.supervision.abortVideoUpload.useMutation();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  // Quitter la page pendant l'envoi le perdrait : le navigateur demande.
  useEffect(() => {
    if (progress === null) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [progress]);

  async function send(file: File) {
    setError(null);
    if (file.type && file.type !== VIDEO_UPLOAD.contentType) {
      setError(t("videos.mp4Only"));
      return;
    }
    let ticket: Awaited<ReturnType<typeof start.mutateAsync>> | null = null;
    try {
      ticket = await start.mutateAsync({
        proposalId,
        role,
        bytes: file.size,
        contentType: VIDEO_UPLOAD.contentType,
      });
      control.current = new AbortController();
      setProgress(0);
      const parts = await uploadParts(
        file,
        ticket,
        setProgress,
        control.current.signal,
      );
      await complete.mutateAsync({
        proposalId,
        role,
        key: ticket.key,
        uploadId: ticket.uploadId,
        parts,
      });
      await onDone();
    } catch (caught) {
      if (ticket) {
        abort.mutate({
          proposalId,
          key: ticket.key,
          uploadId: ticket.uploadId,
        });
      }
      if (caught instanceof UploadAborted)
        setError(t("videos.uploadCancelled"));
      else if (caught instanceof Error && caught.message === "etag")
        setError(t("videos.corsError"));
      else if (caught instanceof Error && caught.message.startsWith("http"))
        setError(t("videos.uploadFailed"));
      else if (caught instanceof Error && caught.message === "network")
        setError(t("videos.uploadFailed"));
      else setError(describeError(caught).message);
    } finally {
      setProgress(null);
      control.current = null;
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={input}
        id={`video-file-${role}`}
        type="file"
        accept="video/mp4"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void send(file);
        }}
      />
      {progress === null ? (
        <Button
          variant="secondary"
          fullWidth
          loading={start.isPending || complete.isPending}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          {t(`videos.upload.${role}` as Cle)}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs tabular-nums text-muted">
            {Math.round(progress * 100)} %
          </span>
          <button
            type="button"
            aria-label={t("videos.cancelUpload")}
            onClick={() => control.current?.abort()}
            className="flex size-8 items-center justify-center rounded-lg text-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {progress !== null && (
        <p className="text-[11px] text-muted">{t("videos.keepOpen")}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** Corriger les moments-clés du match complet, ou les importer d'UNO Vision. */
function MomentsEditor({
  proposalId,
  video,
  videoRef,
  onChanged,
}: {
  proposalId: number;
  video: SessionVideo;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const save = trpc.supervision.setVideoMoments.useMutation();
  const [draft, setDraft] = useState<VideoMoment[]>(video.moments);
  const [times, setTimes] = useState<string[]>(
    video.moments.map((m) => formatClock(m.t)),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(video.moments),
    [draft, video.moments],
  );

  function load(moments: VideoMoment[]) {
    setDraft(moments);
    setTimes(moments.map((m) => formatClock(m.t)));
  }

  async function importFile(chosen: File) {
    setError(null);
    setNotice(null);
    try {
      const moments = parseMomentsDocument(JSON.parse(await chosen.text()));
      if (!moments) throw new Error("format");
      load(moments.slice(0, LIMITS.videoMomentsMax));
      setNotice(t("videos.momentsImported", { count: moments.length }));
    } catch {
      setError(t("videos.momentsBadFile"));
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  function update(index: number, patch: Partial<VideoMoment>) {
    setDraft((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addHere() {
    const at = videoRef.current?.currentTime ?? 0;
    const moment: VideoMoment = {
      t: Math.round(at * 10) / 10,
      kind: "other",
      minute: null,
      label: t("videos.newMoment"),
      detail: "",
    };
    const rows = [...draft, moment].sort((a, b) => a.t - b.t);
    load(rows);
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      await save.mutateAsync({ proposalId, videoId: video.id, moments: draft });
      await onChanged();
      setNotice(t("videos.momentsSaved"));
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t("videos.moments")}</p>
        <input
          ref={file}
          id={`moments-file-${video.id}`}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void importFile(chosen);
          }}
        />
        <Button variant="ghost" onClick={() => file.current?.click()}>
          <FileJson className="size-4" aria-hidden />
          {t("videos.importMoments")}
        </Button>
      </div>
      {draft.length === 0 && (
        <p className="text-xs text-muted">{t("videos.momentsEmpty")}</p>
      )}
      <ul className="space-y-1.5">
        {draft.map((moment, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <Input
              aria-label={t("videos.momentTime")}
              value={times[index] ?? ""}
              className="w-20 shrink-0 tabular-nums"
              onChange={(event) => {
                const text = event.target.value;
                setTimes((rows) =>
                  rows.map((row, i) => (i === index ? text : row)),
                );
                const seconds = parseClock(text);
                if (seconds !== null) update(index, { t: seconds });
              }}
            />
            <Input
              aria-label={t("videos.momentLabel")}
              value={moment.label}
              maxLength={LIMITS.videoMomentLabelMax}
              onChange={(event) => update(index, { label: event.target.value })}
            />
            <button
              type="button"
              aria-label={t("videos.momentRemove")}
              onClick={() => {
                setDraft((rows) => rows.filter((_, i) => i !== index));
                setTimes((rows) => rows.filter((_, i) => i !== index));
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-red-300"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={addHere}>
          <Clock className="size-4" aria-hidden />
          {t("videos.addMomentHere")}
        </Button>
        <Button
          variant="accent"
          loading={save.isPending}
          disabled={!dirty}
          onClick={() => void submit()}
        >
          <Save className="size-4" aria-hidden />
          {t("videos.saveMoments")}
        </Button>
      </div>
      {notice && <p className="text-xs text-success">{notice}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** Le match complet ou le résumé : la vidéo en place, et de quoi la remplacer. */
function RoleSlot({
  proposalId,
  role,
  video,
  storageEnabled,
  onChanged,
  onRemove,
}: {
  proposalId: number;
  role: VideoRole;
  video: SessionVideo | undefined;
  storageEnabled: boolean;
  onChanged: () => Promise<void>;
  onRemove: (videoId: number) => Promise<void>;
}) {
  const t = useT();
  const add = trpc.supervision.addVideo.useMutation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addLink() {
    setError(null);
    try {
      await add.mutateAsync({ proposalId, url: link.trim(), role });
      setLink("");
      await onChanged();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold">
          {t(`videos.role.${role}` as Cle)}
        </p>
        {video && (
          <>
            <span className="text-[11px] text-muted">
              {video.source === "file" && video.bytes
                ? sizeLabel(video.bytes)
                : t(`videos.provider.${video.provider}`)}
            </span>
            <button
              type="button"
              aria-label={t("videos.remove")}
              onClick={() => void onRemove(video.id)}
              className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-red-300"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </>
        )}
      </div>
      {video && <VideoFrame key={video.id} video={video} videoRef={videoRef} />}
      {storageEnabled && (
        <RoleFileUpload
          proposalId={proposalId}
          role={role}
          onDone={onChanged}
        />
      )}
      <div className="flex gap-2">
        <Input
          id={`video-link-${role}`}
          aria-label={t("videos.linkFor", {
            role: t(`videos.role.${role}` as Cle),
          })}
          placeholder={t("videos.linkPlaceholder")}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          inputMode="url"
          autoComplete="off"
          maxLength={LIMITS.videoUrlMax}
        />
        <Button
          variant="secondary"
          loading={add.isPending}
          disabled={link.trim().length === 0}
          onClick={() => void addLink()}
        >
          {t("videos.useLink")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      {role === "match" && video && (
        <MomentsEditor
          key={video.id}
          proposalId={proposalId}
          video={video}
          videoRef={videoRef}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

/**
 * Gestion des vidéos d'une séance.
 *
 * L'administration y dépose le match complet et le résumé — en fichiers sur
 * le stockage de la ligue, ou en liens — et corrige les moments-clés.
 * L'organisateur d'un match personnalisé (PRIV-003) n'a que les liens.
 */
export function SessionVideoEditor({
  proposalId,
  videos,
  onChanged,
  organizer = false,
}: {
  proposalId: number;
  videos: SessionVideo[];
  onChanged: () => Promise<void>;
  /** L'organisateur d'un match personnalisé, par ses propres routes (PRIV-003). */
  organizer?: boolean;
}) {
  const t = useT();
  const adminAdd = trpc.supervision.addVideo.useMutation();
  const adminRemove = trpc.supervision.removeVideo.useMutation();
  const customAdd = trpc.customMatches.addVideo.useMutation();
  const customRemove = trpc.customMatches.removeVideo.useMutation();
  const storage = trpc.supervision.videoStorage.useQuery(undefined, {
    enabled: !organizer,
  });
  const add = organizer ? customAdd : adminAdd;
  const remove = organizer ? customRemove : adminRemove;

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<"" | VideoRole>("");
  const [error, setError] = useState<string | null>(null);

  const others = organizer ? videos : videos.filter((v) => v.role === null);
  const full = videos.length >= LIMITS.videosPerSession;

  async function changed() {
    await Promise.all([onChanged(), storage.refetch()]);
  }

  async function submit() {
    setError(null);
    try {
      await add.mutateAsync({
        proposalId,
        url: url.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(role ? { role } : {}),
      });
      setUrl("");
      setLabel("");
      setRole("");
      await changed();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function drop(videoId: number) {
    setError(null);
    try {
      await remove.mutateAsync({ proposalId, videoId });
      await changed();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <section className="space-y-3">
      <SectionTitle>{t("videos.editorTitle")}</SectionTitle>

      <Card className="space-y-4">
        <div className="flex items-start gap-2">
          <Film className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            {organizer ? t("videos.editorLead") : t("videos.editorLeadAdmin")}
          </p>
        </div>

        {!organizer && (
          <>
            {storage.data && (
              <p className="text-[11px] text-muted">
                {storage.data.enabled
                  ? t("videos.storageUsed", {
                      used: sizeLabel(storage.data.usedBytes),
                      free: sizeLabel(storage.data.freeBytes),
                    })
                  : t("videos.storageOff")}
              </p>
            )}
            {(["match", "summary"] as const).map((slot) => (
              <RoleSlot
                key={slot}
                proposalId={proposalId}
                role={slot}
                video={videos.find((v) => v.role === slot)}
                storageEnabled={storage.data?.enabled ?? false}
                onChanged={changed}
                onRemove={drop}
              />
            ))}
          </>
        )}

        {others.length > 0 && !organizer && (
          <p className="text-sm font-semibold">{t("videos.otherRecordings")}</p>
        )}
        {others.map((video) => (
          <div key={video.id} className="space-y-1.5">
            <VideoFrame key={video.id} video={video} />
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {video.label ? `${video.label} · ` : ""}
                {t(`videos.provider.${video.provider}`)}
              </p>
              <button
                type="button"
                aria-label={t("videos.remove")}
                onClick={() => void drop(video.id)}
                className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-red-300"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}

        {full ? (
          <p className="text-xs text-muted">
            {t("videos.limit", { max: LIMITS.videosPerSession })}
          </p>
        ) : (
          <details
            className="rounded-xl border border-border/60 px-3 py-2"
            open={organizer}
          >
            <summary className="cursor-pointer text-xs font-medium text-muted">
              {t("videos.addOther")}
            </summary>
            <div className="mt-2 space-y-2">
              <Field label={t("videos.url")} htmlFor="video-url">
                <Input
                  id="video-url"
                  placeholder="https://…/match.mp4"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  inputMode="url"
                  autoComplete="off"
                  maxLength={LIMITS.videoUrlMax}
                />
              </Field>
              <Field label={t("videos.label")} htmlFor="video-label">
                <Input
                  id="video-label"
                  placeholder={t("tracker.videoNamePlaceholder")}
                  value={label}
                  maxLength={LIMITS.videoLabelMax}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
              {!organizer && (
                <Field label={t("videos.roleLabel")} htmlFor="video-role">
                  <Select
                    id="video-role"
                    value={role}
                    onChange={(event) =>
                      setRole(event.target.value as "" | VideoRole)
                    }
                  >
                    <option value="">{t("videos.role.none")}</option>
                    <option value="match">{t("videos.role.match")}</option>
                    <option value="summary">{t("videos.role.summary")}</option>
                  </Select>
                </Field>
              )}
              <Button
                variant="secondary"
                fullWidth
                loading={add.isPending}
                disabled={url.trim().length === 0}
                onClick={() => void submit()}
              >
                <Plus className="size-4" aria-hidden />
                {t("videos.add")}
              </Button>
            </div>
          </details>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
      </Card>
    </section>
  );
}
