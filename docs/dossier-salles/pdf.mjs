import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

/*
 * Imprime le dossier « salles » d'une salle : `node pdf.mjs mounier`, ou
 * toutes celles dont le HTML existe, sans argument.
 *
 * Mêmes contrôles que `docs/dossier/pdf.mjs` (largeur, page coupée en bas),
 * plus un : une page qui porte encore une capture « à fournir » sort sous le
 * nom `…-BROUILLON.pdf`. Un brouillon ne doit pas pouvoir partir par erreur
 * sous le nom du dossier définitif.
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
const SALLES = Object.keys(
  JSON.parse(readFileSync(join(D, "salles.json"), "utf8")),
);
const demandees = process.argv.slice(2).length
  ? process.argv.slice(2)
  : SALLES.filter((slug) => existsSync(join(D, `dossier-salles-${slug}.html`)));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
const A4_PX = {
  width: Math.round((210 / 25.4) * 96),
  height: Math.round((297 / 25.4) * 96),
};

for (const slug of demandees) {
  const page = await browser.newPage({ viewport: A4_PX });
  await page.goto(`file://${D}/dossier-salles-${slug}.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);

  const etat = await page.evaluate(() => ({
    largeur: document.documentElement.scrollWidth,
    pages: document.querySelectorAll("section.page").length,
    aFournir: document.querySelectorAll(".a-fournir").length,
    trop: [...document.querySelectorAll("section.page")]
      .map((el, i) => ({
        page: i + 1,
        deborde: el.scrollHeight - el.clientHeight,
      }))
      .filter((x) => x.deborde > 1),
  }));
  if (etat.largeur > A4_PX.width + 1) {
    throw new Error(`${slug} : le document déborde en largeur`);
  }
  if (etat.trop.length) {
    const detail = etat.trop
      .map((x) => `page ${x.page} (+${x.deborde} px)`)
      .join(", ");
    throw new Error(`${slug} : contenu coupé en bas de page : ${detail}`);
  }

  const nom = `UNO-League-salles-${slug}${etat.aFournir ? "-BROUILLON" : ""}.pdf`;
  await page.pdf({
    path: join(D, nom),
    preferCSSPageSize: true,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  for (let i = 0; i < etat.pages; i++) {
    await page
      .locator("section.page")
      .nth(i)
      .screenshot({ path: join(D, `apercu-${slug}-p${i + 1}.png`) });
  }
  console.log(
    `${nom} : ${etat.pages} pages` +
      (etat.aFournir ? ` — ${etat.aFournir} capture(s) à fournir` : ""),
  );
  await page.close();
}
await browser.close();
