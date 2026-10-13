import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Rendu d'un visuel d'annonce en PNG, au pixel près.
 *
 *   node docs/annonces/rendu.mjs premiere-seance-offerte
 *
 * Produit `docs/annonces/<nom>.png` (1080 × 1080), à téléverser tel quel
 * dans Administration → Annonces.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const nom = process.argv[2];
if (!nom) {
  console.error("Usage : node docs/annonces/rendu.mjs <nom du fichier html>");
  process.exit(1);
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.goto(pathToFileURL(join(ICI, `${nom}.html`)).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState("networkidle");

// Un texte qui déborde de sa colonne passerait sur le héros : on refuse.
const debordements = await page.evaluate(() =>
  [...document.querySelectorAll(".texte *")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.className || el.tagName),
);
if (debordements.length) {
  console.error("Texte trop large :", debordements.join(", "));
  process.exit(1);
}

const sortie = join(ICI, `${nom}.png`);
await page.locator("#visuel").screenshot({ path: sortie });
await browser.close();
console.log(sortie);
