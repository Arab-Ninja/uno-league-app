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

const MOT_DE_PASSE = "Demo2026!";

/**
 * Ouvre une session au nom d'un joueur.
 *
 * Plusieurs comptes plutôt qu'un seul : le terrain d'une séance ne dit pas la
 * même chose à qui y joue et à qui la regarde — l'onglet de son équipe est
 * marqué « vous », et les places deviennent touchables. Une capture prise
 * depuis un compte spectateur montrerait un écran en lecture seule, ce qui
 * n'est pas ce que voit un inscrit.
 */
async function connexion(email) {
  /*
   * On efface la session avant d'en ouvrir une autre : `/connexion` renvoie
   * vers l'accueil quand on est déjà connecté, et le formulaire qu'on
   * attendait n'existe alors pas.
   */
  await page.context().clearCookies();
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("connexion →", email, "→", page.url());
}

/**
 * Capture une portion d'écran située sous la ligne de flottaison.
 *
 * Le terrain d'une séance n'est jamais en haut de page : au-dessus de lui
 * vivent le mode, la salle, l'heure et le prix. On fait donc défiler jusqu'au
 * titre demandé avant de déclencher.
 */
/**
 * Capture **la section** qui porte un titre, et non l'écran qui la contient.
 *
 * Une capture de téléphone fait deux fois plus haut que large. Posée à deux
 * par colonne dans le dossier, elle devient illisible ; rognée pour tenir,
 * elle perd le bas du terrain — c'est-à-dire le gardien. Découper la section
 * donne une image presque carrée, qui supporte d'être réduite.
 *
 * Le rectangle est mesuré dans la page, puis passé à `clip` : Playwright sait
 * découper une région, ce qui évite d'avoir à faire défiler au pixel près.
 */
async function capterSection(nom, chemin, titre) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  const zone = await page.evaluate((texte) => {
    const titreNoeud = [
      ...document.querySelectorAll("h2, h3, p, span, div"),
    ].find((noeud) => noeud.textContent?.trim().startsWith(texte));
    const section = titreNoeud?.closest("section");
    if (!section) return null;
    section.scrollIntoView({ block: "start" });
    const r = section.getBoundingClientRect();
    // Huit pixels de marge : sans elle, la bordure du terrain touche le bord
    // de l'image et le cadre paraît coupé.
    return {
      x: Math.max(0, r.x - 8),
      y: Math.max(0, r.y - 8),
      width: Math.min(innerWidth, r.width + 16),
      height: r.height + 16,
    };
  }, titre);

  if (!zone) {
    console.log(`${nom.padEnd(24)} section introuvable pour « ${titre} »`);
    return;
  }

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${nom}.png`, clip: zone });
  console.log(
    `${nom.padEnd(24)} ${chemin.padEnd(18)} ${Math.round(zone.width)}×${Math.round(zone.height)}`,
  );
}

await connexion("robin.desmet@demo.unoleague.app");

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
  // Arrivés après la première version du dossier : le tournoi du jeu de
  // démonstration, et le marché des transferts vu depuis un club.
  ["tournoi", "/tournois/1"],
  ["transferts", "/squad/4/transferts"],
];

for (const [nom, chemin] of ECRANS) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${nom}.png` });
  const titre = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => "?");
  console.log(`${nom.padEnd(24)} ${chemin.padEnd(18)} « ${titre?.trim()} »`);
}

// Une capture longue de la proposition : infos *et* participants sur la même
// image, c'est ce que le dossier doit montrer.
await page.goto(`${BASE}/sessions/17`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await page.screenshot({
  path: `${OUT}/proposition-longue.png`,
  fullPage: true,
});

// Le terrain d'un club : composé par le fondateur, pas déduit des chiffres.
await capterSection("club-terrain", "/squad/4/effectif", "Le Cinq type");

/*
 * Les terrains de séance, chacun depuis un compte qui y joue.
 *
 * UNO League : équipes tirées, poste choisi. Football : camp choisi, et une
 * formation qui suit l'effectif. Les deux se ressemblent à l'écran, et c'est
 * voulu — c'est le même geste.
 */
await connexion("sofiane.meziane@demo.unoleague.app");
await capterSection("terrain-ligue", "/sessions/15", "Les équipes");

await connexion("baptiste.rousseau@demo.unoleague.app");
await capterSection("terrain-grandfoot", "/sessions/19", "Sur le terrain");

console.log("erreurs JS :", errors.length ? errors.slice(0, 3) : "aucune");
await browser.close();
