import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

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

const OUT = join(dirname(fileURLToPath(import.meta.url)), "captures");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.WEB_URL ?? "http://localhost:5173";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "robin.desmet@demo.unoleague.app");
await page.fill('input[type="password"]', "Demo2026!");
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
console.log("connexion →", page.url());

const ECRANS = [
  ["accueil", "/"],
  ["calendrier", "/calendrier"],
  ["classement", "/classement"],
  ["profil", "/profil"],
  ["wallet", "/wallet"],
  ["club", "/squad"],
  ["boutique", "/boutique"],
  ["informations", "/infos"],
  ["modes", "/modes"],
  ["proposition", "/sessions/17"],
  ["proposition-reservation", "/sessions/13"],
];

for (const [nom, chemin] of ECRANS) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${nom}.png` });
  const titre = await page.locator("h1").first().textContent().catch(() => "?");
  console.log(`${nom.padEnd(24)} ${chemin.padEnd(18)} « ${titre?.trim()} »`);
}

// Une capture longue de la proposition : infos *et* participants sur la même
// image, c'est ce que le dossier doit montrer.
await page.goto(`${BASE}/sessions/17`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/proposition-longue.png`, fullPage: true });

console.log("erreurs JS :", errors.length ? errors.slice(0, 3) : "aucune");
await browser.close();
