/**
 * Vidéos de session : reconnaissance des hébergeurs (SUP-002).
 *
 * L'application ne stocke pas les vidéos, elle en garde l'adresse. Reste à
 * savoir ce qu'on peut en faire : jouer la vidéo dans l'écran, ou seulement
 * proposer un lien.
 *
 * **Une adresse fournie par un humain ne devient jamais un cadre intégré sans
 * contrôle.** Un `<iframe>` exécute la page distante à l'intérieur de
 * l'application ; l'ouvrir à n'importe quel domaine, c'est laisser un
 * superviseur y afficher ce qu'il veut, jusqu'à une fausse page de connexion.
 * Seuls deux hébergeurs sont donc jouables, et l'identifiant de la vidéo est
 * extrait puis réécrit dans une adresse que **nous** construisons — le lien
 * d'origine n'est jamais recopié tel quel dans un `src`.
 *
 * Tout le reste reste un lien ordinaire, ouvert dans le navigateur.
 */

export type VideoProvider = "youtube" | "vimeo" | "other";

/**
 * Le rôle d'une vidéo dans sa séance (SUP-004) : le match en entier, ou son
 * résumé. Une séance porte au plus une vidéo de chaque rôle ; les autres
 * restent des enregistrements sans rôle (une seconde prise, un autre angle).
 */
export const VIDEO_ROLES = ["match", "summary"] as const;
export type VideoRole = (typeof VIDEO_ROLES)[number];

/** Ce que marque un moment-clé : c'est aussi son icône dans la liste. */
export const VIDEO_MOMENT_KINDS = [
  "kickoff",
  "goal",
  "save",
  "shot",
  "end",
  "other",
] as const;
export type VideoMomentKind = (typeof VIDEO_MOMENT_KINDS)[number];

/**
 * Un moment-clé du match (SUP-004) : l'instant de la vidéo complète où le
 * revoir — quelques secondes avant l'action, pour la voir venir.
 */
export interface VideoMoment {
  /** En secondes depuis le début de la vidéo. */
  t: number;
  kind: VideoMomentKind;
  /** La minute du match, pour l'afficher ; `null` hors du jeu. */
  minute: number | null;
  label: string;
  detail: string;
}

/**
 * L'envoi d'un fichier vidéo, par morceaux, directement vers le stockage
 * (SUP-004). Seize mégaoctets : assez gros pour qu'une heure de match tienne
 * en une soixantaine de morceaux, assez petit pour qu'un morceau raté se
 * renvoie vite.
 */
export const VIDEO_UPLOAD = {
  partBytes: 16 * 1024 * 1024,
  /** Deux heures en 1080p, avec de la marge : au-delà, c'est une erreur. */
  maxBytes: 6_000_000_000,
  contentType: "video/mp4",
} as const;

/** L'espace offert par le stockage (Cloudflare R2) avant de payer. */
export const VIDEO_FREE_STORAGE_BYTES = 10_000_000_000;

/**
 * L'adresse d'un lecteur intégré qui démarre à `seconds` — pour sauter à un
 * moment-clé dans une vidéo YouTube ou Vimeo. L'adresse de base vient
 * toujours du serveur (`embedUrl`) ; on n'y ajoute qu'un nombre.
 */
export function embedAt(
  embedUrl: string,
  provider: VideoProvider,
  seconds: number,
): string {
  const s = Math.max(0, Math.floor(seconds));
  if (provider === "youtube") return `${embedUrl}?start=${s}&autoplay=1`;
  if (provider === "vimeo") return `${embedUrl}?autoplay=1#t=${s}s`;
  return embedUrl;
}

/**
 * Les moments d'un fichier `moments.json` d'UNO Vision (version 1), dans la
 * forme de l'application. `null` si le fichier n'en est pas un. Le serveur
 * revalide tout : ceci ne fait que traduire.
 */
export function parseMomentsDocument(data: unknown): VideoMoment[] | null {
  if (typeof data !== "object" || data === null) return null;
  const raw = (data as { moments?: unknown }).moments;
  if (!Array.isArray(raw)) return null;
  const kinds = new Set<string>(VIDEO_MOMENT_KINDS);
  const out: VideoMoment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    const t = Number(m["t"]);
    const label = typeof m["label"] === "string" ? m["label"].trim() : "";
    if (!Number.isFinite(t) || t < 0 || !label) continue;
    const kind =
      typeof m["kind"] === "string" && kinds.has(m["kind"])
        ? (m["kind"] as VideoMomentKind)
        : "other";
    const minute = Number(m["minute"]);
    out.push({
      t: Math.round(t * 10) / 10,
      kind,
      minute:
        Number.isFinite(minute) && m["minute"] !== null
          ? Math.round(minute)
          : null,
      label: label.slice(0, 80),
      detail:
        typeof m["detail"] === "string" ? m["detail"].trim().slice(0, 120) : "",
    });
  }
  return out;
}

export const VIDEO_PROVIDER_LABELS: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  other: "Lien externe",
};

/** Un identifiant de vidéo n'est jamais qu'un mot court sans ponctuation. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{6,12}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return YOUTUBE_ID.test(id) ? id : null;
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    // Forme courante : /watch?v=ID
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && YOUTUBE_ID.test(fromQuery)) return fromQuery;

    // Formes /embed/ID, /live/ID, /shorts/ID
    const match = /^\/(?:embed|live|shorts|v)\/([^/?#]+)/.exec(url.pathname);
    const id = match?.[1];
    return id && YOUTUBE_ID.test(id) ? id : null;
  }

  return null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  // /123456789 ou /video/123456789
  const match = /^\/(?:video\/)?(\d+)/.exec(url.pathname);
  const id = match?.[1];
  return id && VIMEO_ID.test(id) ? id : null;
}

export interface VideoLink {
  provider: VideoProvider;
  /**
   * Adresse jouable dans un cadre intégré, construite par nous à partir du
   * seul identifiant. `null` pour tout hébergeur non reconnu : la vidéo est
   * alors proposée en lien, jamais intégrée.
   */
  embedUrl: string | null;
}

/**
 * Vrai si l'adresse désigne un **fichier** que `<video>` sait lire, et non la
 * page d'un lecteur tiers.
 *
 * La distinction est vitale pour la saisie en visionnage : elle relève des
 * positions au millième sur l'élément vidéo et le fait revenir en arrière. Un
 * cadre YouTube ou Vimeo est une page, pas un fichier — on ne peut ni lire sa
 * position ni la fixer sans embarquer le lecteur du site. Une adresse directe
 * (un objet S3, un partage de fichiers, un `.mp4`), elle, se pilote.
 *
 * L'inverse vaut pour une vidéo qu'on se contente de regarder : là, YouTube et
 * Vimeo sont au contraire les seuls hébergeurs intégrables sans risque.
 */
export function isDirectVideoUrl(raw: string): boolean {
  const parsed = parseVideoUrl(raw);
  return parsed !== null && parsed.provider === "other";
}

/**
 * Analyse une adresse de vidéo.
 * Renvoie `null` si ce n'est pas une adresse http(s) exploitable — le seul
 * schéma accepté, pour qu'un `javascript:` ou un `data:` ne franchisse jamais
 * cette porte.
 */
export function parseVideoUrl(raw: string): VideoLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const youtube = youtubeId(url);
  if (youtube) {
    // Le domaine « nocookie » ne dépose rien tant que la vidéo n'est pas lue.
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}`,
    };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
    };
  }

  return { provider: "other", embedUrl: null };
}
