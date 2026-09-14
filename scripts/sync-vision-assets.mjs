/**
 * Copie le moteur WebAssembly de MediaPipe dans les fichiers servis par
 * l'application.
 *
 * Le moteur pèse 12 Mo : le versionner alourdirait chaque `git clone` pour un
 * fichier que `pnpm install` restitue déjà à l'identique, verrouillé par le
 * lockfile. Il est donc recopié depuis `node_modules` avant chaque build et
 * chaque démarrage — sans réseau, contrairement à un téléchargement.
 *
 * Les deux modèles, eux, sont versionnés (`public/vision/models`) : ils ne
 * viennent d'aucun paquet npm, et les télécharger à la construction rendrait
 * le build dépendant d'un service tiers.
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const to = join(root, "apps/web/public/vision/wasm");

/**
 * pnpm place le paquet dans `node_modules` de l'application ; un autre
 * gestionnaire le remonterait à la racine. Les deux chemins sont essayés
 * plutôt que d'en supposer un — un build qui échoue dans l'image Docker pour
 * cette raison se diagnostique mal.
 */
const CANDIDATES = [
  join(root, "apps/web/node_modules/@mediapipe/tasks-vision/wasm"),
  join(root, "node_modules/@mediapipe/tasks-vision/wasm"),
];

/**
 * Seuls les fichiers SIMD sont recopiés.
 *
 * Le repli sans SIMD pèse 11 Mo de plus pour des navigateurs qu'aucun
 * téléphone visé n'utilise (iOS 16.4+, Chrome et Firefox à jour le
 * supportent). Sur un navigateur qui ne le supporte pas, la préparation de la
 * photo est simplement sautée : la photo part telle quelle.
 */
const KEEP = /^vision_wasm_internal\.(js|wasm)$/;

/**
 * `--optional` : prévenir plutôt qu'échouer.
 *
 * En développement, l'absence du moteur ne justifie pas d'arrêter le serveur —
 * et encore moins d'emporter l'API avec lui, ce que `concurrently -k` fait
 * quand une commande échoue. L'application tourne sans : la préparation de la
 * photo se contente alors de renvoyer l'image telle quelle.
 *
 * À la construction, au contraire, l'échec est franc : livrer une application
 * dont une fonctionnalité est silencieusement absente serait pire.
 */
const optional = process.argv.includes("--optional");

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function main() {
  let from = null;
  for (const candidate of CANDIDATES) {
    if ((await sizeOf(candidate)) !== null) {
      from = candidate;
      break;
    }
  }

  if (from === null) {
    const message =
      "Moteur de vision introuvable dans node_modules. " +
      "Lancez `pnpm install` — la dépendance @mediapipe/tasks-vision a été " +
      "ajoutée au projet.";

    if (optional) {
      console.warn(
        `${message}\nL'application démarre quand même : la photo de profil ` +
          "ne sera ni analysée ni détourée.",
      );
      return;
    }

    console.error(message);
    process.exit(1);
  }

  await mkdir(to, { recursive: true });

  const copied = [];
  const kept = [];

  for (const name of await readdir(from)) {
    if (!KEEP.test(name)) continue;

    // 12 Mo recopiés à chaque démarrage pour rien : la taille suffit à savoir
    // que le fichier est déjà là, le moteur étant figé par le lockfile.
    const source = join(from, name);
    const target = join(to, name);
    if ((await sizeOf(source)) === (await sizeOf(target))) {
      kept.push(name);
      continue;
    }

    await cp(source, target);
    copied.push(name);
  }

  console.log(
    copied.length === 0
      ? `Moteur de vision déjà en place (${kept.length} fichiers).`
      : `Moteur de vision copié : ${copied.join(", ")}`,
  );
}

await main();
