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
