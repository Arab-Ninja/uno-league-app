// Rend l'écusson vectoriel en PNG haute définition, pour `genere.py`.
//
// **Pourquoi un navigateur.** Le SVG entaille ses croisements avec des
// masques ; les convertisseurs légers les rendent mal ou pas du tout, et un
// écusson dont l'entrelacs ne s'entrelace plus serait une autre marque.
// Chromium est déjà là pour le dossier PDF, et c'est lui que rendra aussi la
// page d'accueil — le PNG ressemble donc exactement à ce que l'écran montre.
//
// usage : node docs/branding/rend.mjs
//         (PLAYWRIGHT_MODULE=/chemin/vers/playwright si le module n'est pas
//          installé dans le dépôt)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);

const svg = readFileSync(join(ici, "ecusson.svg"), "utf8");
// Le viewBox fait 172 × 192 : 2048 px de haut suffisent pour que la plus
// grande déclinaison — l'icône 1024 — soit une réduction, jamais un
// agrandissement.
const hauteur = 2048;
const largeur = Math.round((hauteur * 172) / 192);

const navigateur = await chromium.launch();
const page = await navigateur.newPage({
  viewport: { width: largeur, height: hauteur },
});
await page.setContent(
  `<html><body style="margin:0;background:transparent">${svg.replace(
    "<svg",
    `<svg width="${largeur}" height="${hauteur}"`,
  )}</body></html>`,
);
await page.screenshot({ path: join(ici, "crest.png"), omitBackground: true });
await navigateur.close();
console.log(`docs/branding/crest.png ${largeur}×${hauteur}`);
