import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Rend chaque SVG de la marque en PNG, aux tailles dont l'application a
 * besoin.
 *
 * Le rendu passe par un navigateur plutôt que par une bibliothèque : c'est le
 * même moteur que celui qui affichera le SVG, donc le PNG ne peut pas
 * diverger de l'original — ce qui arrive dès qu'un convertisseur interprète
 * un masque à sa façon.
 */
const SORTIES = [
  ["icon.svg", "../../apps/web/public/icon-192.png", 192],
  ["icon.svg", "../../apps/web/public/icon-512.png", 512],
  ["icon-maskable.svg", "../../apps/web/public/icon-maskable-512.png", 512],
  ["badge.svg", "../../apps/web/public/badge-72.png", 72],
  // Android : la couche de premier plan d'une icône adaptative. Le système
  // pose sa propre forme derrière, et rogne — d'où la version rembourrée.
  ["icon-maskable.svg", "rendu/android-foreground-432.png", 432],
  ["icon.svg", "rendu/icon-1024.png", 1024],
  ["mark.svg", "rendu/mark-512.png", 512],
];

const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const [source, cible, taille] of SORTIES) {
  const page = await navigateur.newPage({
    viewport: { width: taille, height: taille },
  });
  const svg = readFileSync(resolve(source), "utf8");
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`,
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: cible, omitBackground: true });
  await page.close();
  console.log(`${source.padEnd(20)} → ${cible}  (${taille}px)`);
}

await navigateur.close();
