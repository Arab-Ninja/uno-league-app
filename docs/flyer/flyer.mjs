/**
 * Flyer A5 recto verso : PDF prêt à imprimer et aperçus PNG.
 *
 *   node docs/flyer/flyer.mjs
 *
 * Sortie : `UNO-League-flyer-A5.pdf` (deux pages de 154 × 216 mm, fonds
 * perdus de 3 mm compris, sans traits de coupe) et `apercu-recto.png`,
 * `apercu-verso.png`, rognés au format fini pour juger de la mise en page.
 *
 * Comme `docs/dossier/pdf.mjs`, le script refuse d'imprimer une page dont le
 * contenu déborde : `overflow: hidden` tronquerait en silence.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const D = dirname(fileURLToPath(import.meta.url));
const MM = 96 / 25.4;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({
  viewport: { width: Math.round(154 * MM), height: Math.round(216 * MM) },
  deviceScaleFactor: 300 / 96,
});
await page.goto(`file://${D}/flyer.html`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

const trop = await page.evaluate(() =>
  [...document.querySelectorAll(".contenu, .recto .haut, .recto .bas")]
    .map((el) => {
      const box = el.getBoundingClientRect();
      const pageBox = el.closest(".page").getBoundingClientRect();
      return { el: el.className, bas: Math.round(pageBox.bottom - box.bottom), deborde: el.scrollHeight - el.clientHeight };
    })
    .filter((x) => x.deborde > 1),
);
if (trop.length) throw new Error(`contenu qui déborde : ${JSON.stringify(trop)}`);

await page.pdf({
  path: join(D, "UNO-League-flyer-A5.pdf"),
  preferCSSPageSize: true,
  printBackground: true,
});
// Format exact et format fini déclarés dans le PDF (boites.py).
execFileSync("python3", [join(D, "boites.py"), join(D, "UNO-League-flyer-A5.pdf")]);

// Aperçus au format fini (148 × 210 mm) : les 3 mm de fond perdu sont rognés.
const sections = await page.$$("section.page");
for (const [index, nom] of ["recto", "verso"].entries()) {
  const box = await sections[index].boundingBox();
  await page.screenshot({
    path: join(D, `apercu-${nom}.png`),
    fullPage: true,
    clip: { x: box.x + 3 * MM, y: box.y + 3 * MM, width: 148 * MM, height: 210 * MM },
  });
}

await browser.close();
console.log("UNO-League-flyer-A5.pdf et aperçus écrits dans", D);
