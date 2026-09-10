import { useState } from "react";
import { ExternalLink, Film, Plus, Trash2 } from "lucide-react";
import { LIMITS, VIDEO_PROVIDER_LABELS, type SessionVideo } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import {
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Vidéos d'une session (SUP-002).
 *
 * Ce sont des liens, pas des fichiers : deux heures de futsal pèsent
 * plusieurs gigaoctets, que ni le forfait mobile du superviseur ni le serveur
 * n'ont à porter. La vidéo reste là où elle a été déposée.
 *
 * **Seule une adresse jouable fournie par le serveur est intégrée.** Un
 * `<iframe>` exécute la page distante à l'intérieur de l'application : le
 * client ne décide jamais de ce qui y sera chargé. Le serveur reconnaît
 * YouTube et Vimeo, en extrait l'identifiant et reconstruit l'adresse ;
 * `embedUrl` vaut `null` partout ailleurs, et la vidéo n'est alors qu'un lien
 * ouvert dans le navigateur.
 */

function VideoFrame({ video }: { video: SessionVideo }) {
  if (!video.embedUrl) {
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
          {video.label ?? "Ouvrir la vidéo"}
        </span>
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
      <iframe
        src={video.embedUrl}
        title={video.label ?? `Vidéo ${VIDEO_PROVIDER_LABELS[video.provider]}`}
        className="aspect-video w-full"
        // Le cadre n'a droit qu'à ce qu'il faut pour lire une vidéo.
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

/** Lecture seule : ce que voient les participants d'une session. */
export function SessionVideos({ videos }: { videos: SessionVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>Vidéos de la session</SectionTitle>
      {videos.map((video) => (
        <div key={video.id} className="space-y-1.5">
          <VideoFrame video={video} />
          <p className="px-1 text-[11px] text-muted">
            {video.label ? `${video.label} · ` : ""}
            {VIDEO_PROVIDER_LABELS[video.provider]}
            {video.addedBy ? ` · ajoutée par ${video.addedBy}` : ""}
          </p>
        </div>
      ))}
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

/**
 * Gestion des vidéos pendant la saisie.
 *
 * Une séance de deux heures tient rarement en une prise : on en ajoute
 * autant que nécessaire, dans la limite posée par le serveur.
 */
export function SessionVideoEditor({
  proposalId,
  videos,
  onChanged,
}: {
  proposalId: number;
  videos: SessionVideo[];
  onChanged: () => Promise<void>;
}) {
  const add = trpc.supervision.addVideo.useMutation();
  const remove = trpc.supervision.removeVideo.useMutation();

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const full = videos.length >= LIMITS.videosPerSession;

  async function submit() {
    setError(null);
    try {
      await add.mutateAsync({
        proposalId,
        url: url.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setUrl("");
      setLabel("");
      await onChanged();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function drop(videoId: number) {
    setError(null);
    try {
      await remove.mutateAsync({ proposalId, videoId });
      await onChanged();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <section className="space-y-3">
      <SectionTitle>Vidéos</SectionTitle>

      <Card className="space-y-3">
        <div className="flex items-start gap-2">
          <Film className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Collez l'adresse de la vidéo — YouTube ou Vimeo se lisent
            directement ici, tout autre lien s'ouvre dans le navigateur. Une
            séance de deux heures peut en compter plusieurs.
          </p>
        </div>

        {videos.map((video) => (
          <div key={video.id} className="space-y-1.5">
            <VideoFrame video={video} />
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {video.label ? `${video.label} · ` : ""}
                {VIDEO_PROVIDER_LABELS[video.provider]}
              </p>
              <button
                type="button"
                aria-label="Retirer cette vidéo"
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
            Limite de {LIMITS.videosPerSession} vidéos atteinte pour cette
            session.
          </p>
        ) : (
          <div className="space-y-2">
            <Field label="Adresse de la vidéo" htmlFor="video-url">
              <Input
                id="video-url"
                placeholder="https://youtu.be/..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                inputMode="url"
                autoComplete="off"
                maxLength={LIMITS.videoUrlMax}
              />
            </Field>
            <Field label="Repère (facultatif)" htmlFor="video-label">
              <Input
                id="video-label"
                placeholder="1re heure"
                value={label}
                maxLength={LIMITS.videoLabelMax}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              fullWidth
              loading={add.isPending}
              disabled={url.trim().length === 0}
              onClick={() => void submit()}
            >
              <Plus className="size-4" aria-hidden />
              Ajouter la vidéo
            </Button>
          </div>
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
