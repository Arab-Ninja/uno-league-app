import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Les icônes du projet Android, toutes densités.
 *
 * Trois fichiers par densité, et ils ne jouent pas le même rôle :
 *
 *  - `ic_launcher_foreground` : l'écusson seul, sur fond transparent. Android
 *    l'encastre à 16,7 % (voir `mipmap-anydpi-v26/ic_launcher.xml`), ce qui
 *    fabrique la zone de sécurité — l'image fournie n'a donc pas à la porter ;
 *  - `ic_launcher_background` : une couleur pleine, posée derrière ;
 *  - `ic_launcher` et `ic_launcher_round` : l'icône composée, pour les
 *    versions d'Android antérieures aux icônes adaptatives.
 */
const RES = "../../apps/web/android/app/src/main/res";
const DENSITES = {
  ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192,
};

const navigateur = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function rendre(source, cible, taille, transparent) {
  const page = await navigateur.newPage({ viewport: { width: taille, height: taille } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${taille}px;height:${taille}px}</style>` +
      readFileSync(resolve(source), "utf8"),
  );
  await page.waitForTimeout(120);
  await page.screenshot({ path: cible, omitBackground: transparent });
  await page.close();
}

for (const [densite, taille] of Object.entries(DENSITES)) {
  const dossier = `${RES}/mipmap-${densite}`;
  if (!existsSync(resolve(dossier))) continue;

  await rendre("mark.svg", `${dossier}/ic_launcher_foreground.png`, taille, true);
  await rendre("fond.svg", `${dossier}/ic_launcher_background.png`, taille, false);
  await rendre("icon.svg", `${dossier}/ic_launcher.png`, taille, false);
  await rendre("icon.svg", `${dossier}/ic_launcher_round.png`, taille, false);
  console.log(`mipmap-${densite.padEnd(8)} ${taille}px  ×4`);
}

await navigateur.close();
