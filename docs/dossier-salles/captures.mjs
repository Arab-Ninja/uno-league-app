import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

/*
 * Les captures du dossier « salles », prises sur le jeu de démonstration.
 *
 * Même principe que `docs/dossier/captures.mjs` (base semée, API et site en
 * marche), avec une différence qui fait l'intérêt de ce dossier : le nom des
 * terrains de démonstration est remplacé, **à l'affichage seulement**, par
 * celui de la salle à qui l'on écrit. Le gestionnaire du Centre sportif
 * Mounier voit donc son centre dans le calendrier, la proposition et la
 * réservation — ce qu'un paragraphe ne lui ferait pas imaginer.
 *
 * Le remplacement se fait dans les réponses de l'API, interceptées par
 * Playwright : la base n'est pas touchée, et rien n'est à remettre en état
 * après la prise.
 *
 *   SLUG=mounier node docs/dossier-salles/captures.mjs
 *
 * Le nom affiché vient de `salles.json`, le même fichier que lit `build.py` :
 * la capture et le texte du dossier ne peuvent pas nommer la salle de deux
 * façons. Sans `SLUG`, c'est la version générique (« Votre salle »).
 *
 * La séance terminée (podium, résultats) est aussi prise ici, sur une séance
 * jouée du jeu de démonstration : c'est la doublure des captures de
 * production (README), qui ne servent que si elles sont posées à la main.
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

const ICI = dirname(fileURLToPath(import.meta.url));
const SALLES = JSON.parse(readFileSync(join(ICI, "salles.json"), "utf8"));
const SLUG = process.env.SLUG ?? "generique";
if (!SALLES[SLUG]) {
  console.error(
    `salle inconnue : ${SLUG} (salles.json : ${Object.keys(SALLES).join(", ")})`,
  );
  process.exit(1);
}
const SALLE = SALLES[SLUG].nom;
const BASE = process.env.WEB_URL ?? "http://localhost:5173";
const OUT = join(ICI, "captures", SLUG);
mkdirSync(OUT, { recursive: true });

/*
 * Les terrains du jeu de démonstration (`VENUES`, packages/shared). Tous
 * prennent le nom de la salle : un calendrier où l'on joue chez elle tous les
 * soirs dit exactement ce que le dossier propose. Les plus longs d'abord, pour
 * qu'aucun nom n'en coupe un autre.
 */
const TERRAINS_DEMO = ["Fit Five Forest", "City Five", "YC Five", "Arena"];
// Une séance jouée et une séance ouverte du jeu de démonstration. Elles
// changent avec le jeu de démonstration : elles se règlent ici.
const SEANCE_JOUEE = process.env.SEANCE_JOUEE ?? "1";
const SEANCE_OUVERTE = process.env.SEANCE_OUVERTE ?? "19";
const SEANCE_RESERVATION = process.env.SEANCE_RESERVATION ?? "17";
const COMPTE = process.env.COMPTE ?? "robin.desmet@demo.unoleague.app";
const MOT_DE_PASSE = "Demo2026!";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
const page = await browser.newPage({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/*
 * Le renommage. Seules les réponses JSON de l'API sont réécrites : les
 * scripts et les feuilles de style passent intacts, et un nom de terrain qui
 * traînerait dans le code du site ne serait pas touché.
 */
await page.route(
  (url) => url.pathname.startsWith("/trpc") || url.pathname.startsWith("/api"),
  async (route) => {
    const reponse = await route.fetch();
    const type = reponse.headers()["content-type"] ?? "";
    if (!type.includes("json")) return route.fulfill({ response: reponse });
    let corps = await reponse.text();
    for (const nom of TERRAINS_DEMO) corps = corps.split(nom).join(SALLE);
    return route.fulfill({ response: reponse, body: corps });
  },
);

async function connexion(email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("connexion →", email, "→", page.url());
}

async function ecran(nom, chemin) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${nom}.png` });
  console.log(`${nom.padEnd(20)} ${chemin}`);
}

/**
 * Une ou plusieurs sections d'un écran, découpées d'un seul tenant.
 *
 * `depuis` et `jusqua` sont les titres de la première et de la dernière
 * section à prendre (`jusqua` absent : la première seule). La fenêtre est
 * agrandie le temps de la prise : une section plus haute que l'écran serait
 * coupée, et le podium avec ses cartes l'est presque toujours.
 */
async function sections(nom, chemin, depuis, jusqua = depuis) {
  await page.setViewportSize({ width: 412, height: 2400 });
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const zone = await page.evaluate(
    ([a, b]) => {
      const trouve = (texte) =>
        [...document.querySelectorAll("h2, h3, p, span, div")]
          .find(
            (n) =>
              n.children.length === 0 &&
              n.textContent?.trim().startsWith(texte),
          )
          ?.closest("section");
      const haut = trouve(a);
      const bas = trouve(b);
      if (!haut || !bas) return null;
      haut.scrollIntoView({ block: "start" });
      const r1 = haut.getBoundingClientRect();
      const r2 = bas.getBoundingClientRect();
      return {
        x: Math.max(0, r1.x - 8),
        y: Math.max(0, r1.y - 8),
        width: Math.min(innerWidth, r1.width + 16),
        height: r2.bottom - r1.top + 16,
      };
    },
    [depuis, jusqua],
  );
  if (!zone) {
    console.log(
      `${nom.padEnd(20)} sections introuvables : « ${depuis} » → « ${jusqua} »`,
    );
  } else {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${nom}.png`, clip: zone });
    console.log(
      `${nom.padEnd(20)} ${chemin} ${Math.round(zone.width)}×${Math.round(zone.height)}`,
    );
  }
  await page.setViewportSize({ width: 412, height: 892 });
}

await connexion(COMPTE);

// Avant le match : ce que voit un joueur, et ce qui remplit le créneau.
await ecran("accueil", "/");
await ecran("calendrier", "/calendrier");
await ecran("proposition", `/sessions/${SEANCE_OUVERTE}`);
await ecran("reservation", `/sessions/${SEANCE_RESERVATION}`);

/*
 * Proposer un créneau : la feuille qui s'ouvre sous le « + » du calendrier,
 * où le joueur choisit le mode, la salle et l'heure. C'est là que la salle
 * apparaît comme lieu de jeu.
 */
await page.goto(`${BASE}/calendrier`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page
  .locator("header button, main button")
  .filter({ has: page.locator("svg.lucide-plus") })
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(1500);
/*
 * La liste des lieux vient de la table `venues`. Sur une base fraîche, le
 * semis peut la laisser sans les terrains de démonstration (README) : le
 * sélecteur reste alors sur « Choisir un lieu », et la capture le montre.
 */
await page
  .selectOption("#venue", { index: 1 })
  .catch(() => console.log("aucun lieu à choisir"));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/proposer.png` });
console.log(`${"proposer".padEnd(20)} /calendrier (+)`);

// Après le match : la doublure des captures de production.
await ecran("seance-haut", `/sessions/${SEANCE_JOUEE}`);
await sections(
  "seance-podium",
  `/sessions/${SEANCE_JOUEE}`,
  "Podium de la session",
);
await sections(
  "seance-resultats",
  `/sessions/${SEANCE_JOUEE}`,
  "Résultats",
  "Feuille de match",
);

// Pourquoi l'on revient.
await ecran("profil", "/profil");
await ecran("wallet", "/wallet");
await ecran("classement", "/classement");

console.log("salle affichée :", SALLE, "→", OUT);
console.log("erreurs JS :", errors.length ? errors.slice(0, 3) : "aucune");
await browser.close();
