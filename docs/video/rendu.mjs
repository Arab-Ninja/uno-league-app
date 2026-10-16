/**
 * Rendu de la publicité verticale : 1 200 images capturées dans Chromium,
 * encodées en MP4 avec la musique.
 *
 *   python3 docs/video/musique.py            # rendu/musique.wav
 *   node docs/video/rendu.mjs                # rendu/UNO-League-pub-9x16.mp4
 *   node docs/video/rendu.mjs --instants 1.5,6,10.8
 *                                            # rendu/instant-<t>.png, pour relire une image
 *
 * Demande ffmpeg dans le PATH. Les images ne passent jamais par le disque :
 * plusieurs navigateurs les capturent en parallèle, et elles sont remises
 * dans l'ordre avant d'entrer dans ffmpeg.
 *
 * Pourquoi `--allow-file-access-from-files` : la carte joueur est détourée
 * dans un canvas, et Chromium refuse de relire les pixels d'une image chargée
 * depuis file:// sans ce drapeau.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, "rendu");
const DUREE = 20;
const FPS = 60;
const ONGLETS = Number(process.env.ONGLETS ?? 4);
mkdirSync(SORTIE, { recursive: true });

const i = process.argv.indexOf("--instants");
const instants = i > 0 ? process.argv[i + 1].split(",").map(Number) : null;

// Un navigateur par onglet, et non quatre onglets dans un seul : la
// composition se fait dans le processus du navigateur, et un seul processus
// n'occuperait qu'un cœur.
const navigateurs = [];
async function ouvrir() {
  const navigateur = await chromium.launch({
    args: ["--allow-file-access-from-files"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  navigateurs.push(navigateur);
  const page = await navigateur.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", (e) => { console.error(e); process.exitCode = 1; });
  await page.goto(`${pathToFileURL(join(ICI, "pub.html")).href}?rendu`);
  if (!(await page.evaluate(() => window.pret))) throw new Error("pub.html ne s'est pas chargée.");
  return page;
}

async function capturer(page, t) {
  await page.evaluate((t) => window.rendre(t), t);
  return page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
}

if (instants) {
  const page = await ouvrir();
  for (const t of instants) {
    const nom = join(SORTIE, `instant-${t.toFixed(2)}.png`);
    writeFileSync(nom, await capturer(page, t));
    console.log(nom);
  }
  await Promise.all(navigateurs.map((n) => n.close()));
  process.exit();
}

const musique = join(SORTIE, "musique.wav");
const video = join(SORTIE, "UNO-League-pub-9x16.mp4");
if (!existsSync(musique)) console.warn("Pas de rendu/musique.wav : la vidéo sera muette (python3 docs/video/musique.py).");

const ffmpeg = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  ...(existsSync(musique) ? ["-i", musique] : []),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-profile:v", "high", "-level", "4.2", "-r", String(FPS),
  ...(existsSync(musique) ? ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest"] : []),
  "-movflags", "+faststart", video,
], { stdio: ["pipe", "inherit", "inherit"] });
const fin = new Promise((ok, ko) => ffmpeg.on("close", (c) => (c === 0 ? ok() : ko(new Error(`ffmpeg : code ${c}`)))));

const total = DUREE * FPS;
const enAttente = new Map();
let suivante = 0;
const debut = Date.now();

async function vider() {
  while (enAttente.has(suivante)) {
    const image = enAttente.get(suivante);
    enAttente.delete(suivante);
    if (!ffmpeg.stdin.write(image)) await new Promise((ok) => ffmpeg.stdin.once("drain", ok));
    suivante++;
    if (suivante % 60 === 0) {
      const s = (Date.now() - debut) / 1000;
      console.log(`${suivante}/${total} images · ${s.toFixed(0)} s`);
    }
  }
}

let ecriture = Promise.resolve();
async function onglet(n) {
  const page = await ouvrir();
  for (let k = n; k < total; k += ONGLETS) {
    // Un onglet trop en avance attend les autres : la mémoire reste bornée.
    while (k - suivante > 4 * ONGLETS) await new Promise((ok) => setTimeout(ok, 20));
    enAttente.set(k, await capturer(page, k / FPS));
    ecriture = ecriture.then(vider);
  }
}

await Promise.all(Array.from({ length: ONGLETS }, (_, n) => onglet(n)));
await ecriture;
ffmpeg.stdin.end();
await fin;
await Promise.all(navigateurs.map((n) => n.close()));
console.log(video);
