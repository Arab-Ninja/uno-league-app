/**
 * Rendu de la publicité « La saison » : chaque image capturée dans Chromium,
 * encodée en MP4 avec la musique montée.
 *
 *   node docs/video/rendu.mjs                # rendu/UNO-League-la-saison-9x16.mp4
 *   node docs/video/rendu.mjs --instants 3.5,14.2,31
 *                                            # rendu/instant-<t>.png, pour relire une image
 *   node docs/video/rendu.mjs --fond-or      # carte/fond-or.png, pour detoure.py
 *
 * La musique n'est pas versionnée : posez-la dans `musique/football-edits.wav`
 * (ou indiquez son chemin dans MUSIQUE). Elle est montée ainsi : du début au
 * temps fort de 44,15 s, puis la fin du morceau à partir de 93,28 s — le même
 * temps fort, une minute plus loin. Les deux se recouvrent 15 ms, sur le
 * silence qui précède le coup, et on n'entend pas la coupe.
 *
 * Demande ffmpeg dans le PATH. Les images ne passent jamais par le disque :
 * plusieurs navigateurs les capturent en parallèle, et elles sont remises
 * dans l'ordre avant d'entrer dans ffmpeg.
 *
 * Pourquoi `--allow-file-access-from-files` : la page charge ses images et
 * ses polices depuis le dépôt, en file://.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, "rendu");
const ONGLETS = Number(process.env.ONGLETS ?? 4);
mkdirSync(SORTIE, { recursive: true });

const MUSIQUE = process.env.MUSIQUE ?? join(ICI, "musique", "football-edits.wav");
const COUPE = 44.15;
const REPRISE = 93.28;
const FONDU = 0.015;

const lancer = () =>
  chromium.launch({
    args: ["--allow-file-access-from-files"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

// Le fond de la carte or, à l'échelle et à la place de la capture du flyer.
if (process.argv.includes("--fond-or")) {
  const n = await lancer();
  const page = await n.newPage({ viewport: { width: 310, height: 546 }, deviceScaleFactor: 3 });
  await page.goto(pathToFileURL(join(ICI, "carte", "fond-or.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ICI, "carte", "fond-or.png") });
  await n.close();
  console.log(join(ICI, "carte", "fond-or.png"));
  process.exit();
}

// Un navigateur par onglet, et non quatre onglets dans un seul : la
// composition se fait dans le processus du navigateur, et un seul processus
// n'occuperait qu'un cœur.
const navigateurs = [];
async function ouvrir() {
  const navigateur = await lancer();
  navigateurs.push(navigateur);
  const page = await navigateur.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", (e) => { console.error(e); process.exitCode = 1; });
  await page.goto(`${pathToFileURL(join(ICI, "saison.html")).href}?rendu`);
  if (!(await page.evaluate(() => window.pret))) throw new Error("saison.html ne s'est pas chargée.");
  return page;
}

async function capturer(page, t) {
  await page.evaluate((t) => window.rendre(t), t);
  return page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
}

const fermer = () => Promise.all(navigateurs.map((n) => n.close()));

const i = process.argv.indexOf("--instants");
if (i > 0) {
  const page = await ouvrir();
  for (const t of process.argv[i + 1].split(",").map(Number)) {
    const nom = join(SORTIE, `instant-${t.toFixed(2)}.png`);
    writeFileSync(nom, await capturer(page, t));
    console.log(nom);
  }
  await fermer();
  process.exit();
}

const premiere = await ouvrir();
const { DUREE, FPS } = await premiere.evaluate(() => ({ DUREE: window.DUREE, FPS: window.FPS }));

// La musique montée, que l'aperçu de la page joue aussi.
const montee = join(SORTIE, "musique-montee.wav");
if (!existsSync(MUSIQUE)) throw new Error(`Musique introuvable : ${MUSIQUE}`);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-i", MUSIQUE,
  "-filter_complex",
  `[0:a]atrim=0:${COUPE},asetpts=PTS-STARTPTS[a];` +
  `[0:a]atrim=start=${REPRISE},asetpts=PTS-STARTPTS[b];` +
  `[a][b]acrossfade=d=${FONDU}:c1=tri:c2=tri,afade=t=out:st=${DUREE - 0.5}:d=0.5`,
  "-ar", "48000", montee,
]);

const video = join(SORTIE, "UNO-League-la-saison-9x16.mp4");
const ffmpeg = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  "-i", montee,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-profile:v", "high", "-level", "4.2", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest",
  "-movflags", "+faststart", video,
], { stdio: ["pipe", "inherit", "inherit"] });
const fin = new Promise((ok, ko) => ffmpeg.on("close", (c) => (c === 0 ? ok() : ko(new Error(`ffmpeg : code ${c}`)))));

const total = Math.round(DUREE * FPS);
const enAttente = new Map();
let suivante = 0;
const debut = Date.now();

async function vider() {
  while (enAttente.has(suivante)) {
    const image = enAttente.get(suivante);
    enAttente.delete(suivante);
    if (!ffmpeg.stdin.write(image)) await new Promise((ok) => ffmpeg.stdin.once("drain", ok));
    suivante++;
    if (suivante % (10 * FPS) === 0) console.log(`${suivante}/${total} images · ${((Date.now() - debut) / 1000).toFixed(0)} s`);
  }
}

let ecriture = Promise.resolve();
async function onglet(n) {
  const page = n === 0 ? premiere : await ouvrir();
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
await fermer();
console.log(video);
