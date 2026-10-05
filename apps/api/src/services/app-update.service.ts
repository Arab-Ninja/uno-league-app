import { z } from "zod";
import { publicWebUrl } from "../email/links.js";
import { logger } from "../lib/logger.js";

/**
 * Mises à jour à chaud de l'application mobile (OTA-001).
 *
 * Le plugin `@capgo/capacitor-updater` demande à chaque lancement s'il existe
 * une version plus récente. Il s'adressait au service de Capgo, devenu
 * payant ; il s'adresse désormais ici. La réponse suit le protocole du
 * plugin : soit `{ version, url, checksum }` — il télécharge l'archive,
 * vérifie l'empreinte SHA-256 et l'applique au lancement suivant —, soit
 * `{ kind: "up_to_date" }`, et il ne fait rien.
 *
 * Le paquet et son manifeste sont fabriqués au déploiement du site
 * (`scripts/ota-paquet.mjs`) et servis par lui : l'API ne fait que lire le
 * manifeste et décider, appareil par appareil.
 */

const VERSION = /^\d+\.\d+\.\d+$/;

const manifestSchema = z.object({
  version: z.string().regex(VERSION),
  fichier: z.string().regex(/^[A-Za-z0-9._-]+\.zip$/),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  natifMinimum: z.string().regex(VERSION),
});

export type AppUpdateManifest = z.infer<typeof manifestSchema>;

export type AppUpdateAnswer =
  | { version: string; url: string; checksum: string }
  | { kind: "up_to_date"; error: string; message: string };

const AUCUNE: AppUpdateAnswer = {
  kind: "up_to_date",
  error: "no_new_version_available",
  message: "Aucune nouvelle version.",
};

/** -1, 0 ou 1, comme un comparateur de tri ; `null` si l'une est illisible. */
export function compareVersions(a: string, b: string): number | null {
  if (!VERSION.test(a) || !VERSION.test(b)) return null;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/**
 * La décision, sans réseau : ce qu'on répond à un appareil donné.
 *
 * Le plugin envoie `version_build`, la version embarquée dans le binaire, et
 * `version_name`, celle qui tourne — `"builtin"` tant qu'aucune mise à jour
 * n'a été appliquée. Trois refus, dans l'ordre :
 *
 *  1. **jamais moins récent que le binaire** : après une mise à jour depuis
 *     le store, le paquet embarqué est neuf, un ancien le remplacerait ;
 *  2. **jamais à un binaire trop ancien** : un paquet qui appelle un plugin
 *     natif ajouté depuis planterait. `natifMinimum` le dit ;
 *  3. **rien si l'appareil l'a déjà**.
 *
 * Une version *inférieure* à celle qui tourne reste proposée : c'est ainsi
 * qu'on revient en arrière après un paquet défectueux.
 */
export function decideAppUpdate(
  manifest: AppUpdateManifest | null,
  device: { version_build?: unknown; version_name?: unknown },
  siteUrl: string,
): AppUpdateAnswer {
  if (!manifest) return AUCUNE;

  const natif =
    typeof device.version_build === "string" ? device.version_build : "";
  const courante =
    typeof device.version_name === "string" &&
    device.version_name !== "builtin" &&
    device.version_name !== ""
      ? device.version_name
      : natif;

  if (compareVersions(manifest.version, natif) !== 1) return AUCUNE;
  if (compareVersions(natif, manifest.natifMinimum) === -1) return AUCUNE;
  if (courante === manifest.version) return AUCUNE;

  return {
    version: manifest.version,
    url: `${siteUrl}/ota/${manifest.fichier}`,
    checksum: manifest.checksum,
  };
}

// ---------------------------------------------------------------------------
// Lecture du manifeste
// ---------------------------------------------------------------------------

/**
 * Le manifeste est relu au plus une fois par minute : chaque lancement de
 * l'application interroge l'API, le site n'a pas à suivre ce rythme. Un échec
 * est mémorisé de même — un site injoignable ne doit pas être martelé.
 */
const DUREE_CACHE_MS = 60_000;
let cache: { lu: number; manifest: AppUpdateManifest | null } | null = null;

async function lireManifeste(
  siteUrl: string,
): Promise<AppUpdateManifest | null> {
  if (cache && Date.now() - cache.lu < DUREE_CACHE_MS) return cache.manifest;

  let manifest: AppUpdateManifest | null = null;
  try {
    // Le paramètre contourne le cache du CDN : le manifeste change à chaque
    // déploiement, sous le même nom.
    const reponse = await fetch(
      `${siteUrl}/ota/manifest.json?t=${Date.now()}`,
      {
        signal: AbortSignal.timeout(5_000),
      },
    );
    // Sans manifeste, le site renvoie sa page d'accueil (réécriture SPA) :
    // l'analyse échoue, et c'est la réponse voulue — pas de mise à jour.
    const lu = manifestSchema.safeParse(
      reponse.ok ? await reponse.json().catch(() => null) : null,
    );
    if (lu.success) manifest = lu.data;
    else logger.warn("manifeste de mise à jour absent ou illisible");
  } catch (error) {
    logger.warn({ err: error }, "manifeste de mise à jour injoignable");
  }

  cache = { lu: Date.now(), manifest };
  return manifest;
}

/** Réponse à une demande du plugin. Ne lève jamais : au pire, « rien ». */
export async function answerAppUpdate(body: unknown): Promise<AppUpdateAnswer> {
  const siteUrl = publicWebUrl();
  if (!siteUrl) return AUCUNE;

  const device =
    body && typeof body === "object"
      ? (body as { version_build?: unknown; version_name?: unknown })
      : {};
  return decideAppUpdate(await lireManifeste(siteUrl), device, siteUrl);
}

/** Pour les tests : oublie le manifeste mémorisé. */
export function resetAppUpdateCache(): void {
  cache = null;
}
