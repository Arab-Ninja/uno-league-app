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

async function main() {
  let from = null;
  for (const candidate of CANDIDATES) {
    try {
      await stat(candidate);
      from = candidate;
      break;
    } catch {
      // Chemin suivant.
    }
  }

  if (from === null) {
    console.error(
      "MediaPipe introuvable dans node_modules : lancez `pnpm install`.",
    );
    process.exit(1);
  }

  await mkdir(to, { recursive: true });

  const copied = [];
  for (const name of await readdir(from)) {
    if (!KEEP.test(name)) continue;
    await cp(join(from, name), join(to, name));
    copied.push(name);
  }

  console.log(`Moteur de vision copié : ${copied.join(", ")}`);
}

await main();
