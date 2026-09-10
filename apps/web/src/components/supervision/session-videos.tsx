import { useState } from "react";
import { ExternalLink, Film, Plus, Trash2 } from "lucide-react";
import { LIMITS, VIDEO_PROVIDER_LABELS, type SessionVideo } from "@uno/shared";
import { cn } from "@/lib/cn.js";
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
  const [failed, setFailed] = useState(false);

  /**
   * Un hébergeur reconnu se lit dans un cadre, l'identifiant ayant été extrait
   * et l'adresse reconstruite par le serveur.
   */
  if (video.embedUrl) {
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

  /**
   * Tout le reste est traité comme un **fichier vidéo** et joué sur place.
   *
   * C'est le cas courant ici : la vidéo qui a servi à compter les statistiques
   * est un enregistrement déposé quelque part, pas une page de lecteur. Un
   * élément `<video>` n'exécute rien — contrairement à un cadre — et ne peut
   * donc pas servir de porte d'entrée à une page hostile, quelle que soit
   * l'adresse.
   *
   * Si le navigateur n'en tire rien — format inconnu, fichier déplacé, hôte
   * qui refuse la lecture directe — on retombe sur un lien plutôt que de
   * laisser un rectangle noir sans explication.
   */
  if (!failed) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
        <video
          src={video.url}
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-black"
          onError={() => setFailed(true)}
        />
      </div>
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
        {video.label ?? "Ouvrir la vidéo"}
      </span>
    </a>
  );
}

/**
 * Lecture seule : ce que voient les participants d'une session.
 *
 * **Une seule vidéo à l'écran.** Une séance de deux heures en compte deux ou
 * trois ; les empiler toutes ferait défiler un mur de lecteurs devant le
 * résultat, que le joueur est venu voir en premier. On montre la première, et
 * les autres se choisissent d'un geste quand il y en a.
 */
export function SessionVideos({ videos }: { videos: SessionVideo[] }) {
  const [current, setCurrent] = useState(0);
  if (videos.length === 0) return null;

  const video = videos[Math.min(current, videos.length - 1)];
  if (!video) return null;

  return (
    <section className="space-y-2">
      <SectionTitle>
        {videos.length > 1 ? "Vidéos de la session" : "Vidéo de la session"}
      </SectionTitle>

      {videos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {videos.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCurrent(index)}
              aria-pressed={index === current}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                index === current
                  ? "bg-accent text-background"
                  : "bg-surface text-muted hover:text-foreground",
              )}
            >
              {entry.label ?? `Vidéo ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      <VideoFrame video={video} />
      <p className="px-1 text-[11px] text-muted">
        {video.label ?? "Enregistrement"}
        {video.addedBy ? ` · ajoutée par ${video.addedBy}` : ""}
      </p>
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
            Collez l'adresse de l'enregistrement : il se lit directement ici.
            Une séance de deux heures peut en compter plusieurs. Les vidéos
            ajoutées pendant la saisie en visionnage arrivent ici toutes
            seules, à la publication de la feuille.
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
                placeholder="https://…/match.mp4"
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
