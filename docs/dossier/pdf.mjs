import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/*
 * Playwright n'est pas une dépendance du dépôt : il pèse une cinquantaine de
 * mégaoctets et ne sert qu'à fabriquer ce dossier, deux fois par an. On le
 * charge donc à la demande, avec un message qui dit quoi faire plutôt qu'un
 * `ERR_MODULE_NOT_FOUND`. `PLAYWRIGHT_MODULE` sert quand il est installé
 * ailleurs que dans le dépôt.
 */
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright"));
} catch {
  console.error(
    "Playwright est nécessaire pour cette étape :\n" +
      "  npm i -D playwright && npx playwright install chromium\n" +
      "ou, s'il est déjà installé ailleurs :\n" +
      "  PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs node " +
      process.argv[1],
  );
  process.exit(1);
}

const D = dirname(fileURLToPath(import.meta.url));

// `CHROMIUM_PATH` sert aux machines où Playwright ne télécharge pas son propre
// navigateur ; sans elle, Playwright prend celui qu'il a installé.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
// La fenêtre fait exactement une page A4 à 96 ppp : c'est le seul moyen de
// mesurer un débordement, `scrollWidth` valant au minimum la largeur de la
// fenêtre.
const A4_PX = { width: Math.round((210 / 25.4) * 96), height: Math.round((297 / 25.4) * 96) };
const page = await browser.newPage({ viewport: A4_PX });
await page.goto(`file://${D}/dossier.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Le document ne doit dépasser la page ni en largeur ni en hauteur : c'est ce
// débordement qui, au premier tirage, faisait réduire tout le dossier à 84 %
// et l'entourait de blanc.
const debord = await page.evaluate(() => ({
  largeur: document.documentElement.scrollWidth,
  pages: document.querySelectorAll("section.page").length,
  /*
   * Les pages ont `overflow: hidden` — sans quoi le halo de la couverture
   * élargit le document. La contrepartie est qu'une page trop pleine ne se
   * plaint pas : elle se coupe en silence, et l'on ne s'en aperçoit qu'en
   * regardant le PDF. On mesure donc chaque page.
   */
  trop: [...document.querySelectorAll("section.page")]
    .map((el, i) => ({ page: i + 1, deborde: el.scrollHeight - el.clientHeight }))
    .filter((x) => x.deborde > 1),
}));
console.log("largeur du document :", debord.largeur, "px (attendu", A4_PX.width + ")");
if (debord.largeur > A4_PX.width + 1) {
  throw new Error("le document déborde en largeur : Chromium réduirait tout le dossier");
}
if (debord.trop.length) {
  const detail = debord.trop.map((x) => `page ${x.page} (+${x.deborde} px)`).join(", ");
  throw new Error(`contenu coupé en bas de page : ${detail}`);
}

await page.pdf({
  path: `${D}/UNO-League-dossier.pdf`,
  // `preferCSSPageSize` fait foi sur `@page { size: 210mm 297mm }` : le
  // mot-clé `format: "A4"` sortait une page de 210,2 × 297,3 mm.
  preferCSSPageSize: true,
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

// Un aperçu par page, pour pouvoir regarder le résultat plutôt que l'imaginer.
for (let i = 0; i < debord.pages; i++) {
  await page.locator("section.page").nth(i).screenshot({ path: `${D}/p${i + 1}.png` });
}
console.log("sections :", debord.pages);
await browser.close();
