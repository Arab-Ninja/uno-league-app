import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Rendu de la vidéo « Match amical », image par image.
 *
 *   node docs/video-amical/rendu.mjs                    vidéo complète (60 i/s)
 *   node docs/video-amical/rendu.mjs --fps 30           cadence réduite
 *   node docs/video-amical/rendu.mjs --images 1,4.5,12  quelques images PNG
 *
 * Chaque image est calculée par `seek(t)` puis capturée : le résultat ne
 * dépend ni de la vitesse de la machine ni d'une horloge. Plusieurs onglets
 * rendent chacun une tranche, que ffmpeg assemble ensuite. Si `son.wav`
 * existe (voir `son.py`), il est ajouté à la vidéo.
 *
 * Sorties dans `docs/video-amical/rendu/`, hors du dépôt.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, "rendu");
const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : defaut;
};
const FPS = Number(option("fps", 60));
const ONGLETS = Number(option("onglets", 4));
const CRF = option("crf", "16");
mkdirSync(SORTIE, { recursive: true });

// `require` suit NODE_PATH, là où un `import` nu ne cherche que node_modules.
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(process.env.PLAYWRIGHT_MODULE)
  : createRequire(import.meta.url)("playwright");
const navigateur = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

async function ouvrePage() {
  const page = await navigateur.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", (erreur) => console.error("Erreur dans la page :", erreur.message));
  await page.goto(`${pathToFileURL(join(ICI, "index.html")).href}?rendu`);
  await page.evaluate(() => window.pret);
  return page;
}

function attend(processus, nom) {
  return new Promise((ok, echec) =>
    processus.on("close", (code) => (code === 0 ? ok() : echec(new Error(`${nom} : code ${code}`)))),
  );
}

async function capture(cdp) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
  return Buffer.from(data, "base64");
}

// --- Quelques images, pour contrôler une scène -------------------------------
const images = option("images", null);
if (images) {
  const dossier = join(SORTIE, "images");
  mkdirSync(dossier, { recursive: true });
  const page = await ouvrePage();
  const cdp = await page.context().newCDPSession(page);
  const fichiers = [];
  for (const instant of images.split(",").map(Number)) {
    await page.evaluate((t) => window.seek(t), instant);
    const fichier = join(dossier, `t${instant.toFixed(2).padStart(5, "0")}.png`);
    writeFileSync(fichier, await capture(cdp));
    fichiers.push(fichier);
  }
  await navigateur.close();
  console.log(fichiers.join("\n"));
  process.exit(0);
}

// --- La vidéo complète ---------------------------------------------------------
const duree = await (async () => {
  const page = await ouvrePage();
  const d = await page.evaluate(() => window.DUREE);
  await page.close();
  return d;
})();
const total = Math.round(duree * FPS);
const parTranche = Math.ceil(total / ONGLETS);
const debut = Date.now();
let faites = 0;

async function tranche(index) {
  const de = index * parTranche;
  const a = Math.min(total, de + parTranche);
  const fichier = join(SORTIE, `tranche-${index}.mp4`);
  if (de >= a) return null;
  const page = await ouvrePage();
  const cdp = await page.context().newCDPSession(page);
  const ffmpeg = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-pix_fmt", "yuv420p",
      "-profile:v", "high", "-level", "4.2", "-r", String(FPS), fichier],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  for (let i = de; i < a; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const image = await capture(cdp);
    if (!ffmpeg.stdin.write(image)) await new Promise((ok) => ffmpeg.stdin.once("drain", ok));
    faites++;
    if (faites % 120 === 0) {
      const ecoule = (Date.now() - debut) / 1000;
      console.log(`${faites}/${total} images — ${ecoule.toFixed(0)} s`);
    }
  }
  ffmpeg.stdin.end();
  await attend(ffmpeg, `ffmpeg tranche ${index}`);
  await page.close();
  return fichier;
}

const tranches = (await Promise.all(Array.from({ length: ONGLETS }, (_, i) => tranche(i)))).filter(Boolean);
await navigateur.close();

const liste = join(SORTIE, "tranches.txt");
writeFileSync(liste, tranches.map((f) => `file '${f}'`).join("\n"));
const muette = join(SORTIE, `match-amical-muet-${FPS}.mp4`);
await attend(
  spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", liste, "-c", "copy", "-movflags", "+faststart", muette], { stdio: "inherit" }),
  "assemblage",
);
for (const f of tranches) rmSync(f);
rmSync(liste);
console.log(muette);

const son = join(ICI, "rendu", "son.wav");
if (existsSync(son)) {
  const finale = join(SORTIE, `match-amical-${FPS}.mp4`);
  await attend(
    // -14 LUFS, crête à -1,5 dB : le niveau qu'Instagram et TikTok attendent.
    spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", muette, "-i", son, "-map", "0:v", "-map", "1:a",
      "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-shortest", "-movflags", "+faststart", finale], { stdio: "inherit" }),
    "mixage",
  );
  console.log(finale);
}
console.log(`Terminé en ${((Date.now() - debut) / 1000).toFixed(0)} s`);
