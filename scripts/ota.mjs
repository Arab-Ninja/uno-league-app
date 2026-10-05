import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Publier une mise à jour à chaud (OTA-001).
 *
 * Le contenu web est embarqué dans le binaire ; sans ce mécanisme, la moindre
 * correction de texte imposerait un nouveau dépôt sur Google Play et une revue
 * Apple de un à trois jours. Ici, elle atteint les téléphones au lancement
 * suivant.
 *
 * Ce que cela **ne** couvre pas : tout ce qui est natif — nouveau plugin,
 * icône, permissions, version minimale d'OS. Ces changements-là repassent par
 * les stores, et relèvent `unoleague.natifMinimum` dans
 * `apps/web/package.json` : les binaires plus anciens cessent alors de
 * recevoir des paquets qu'ils ne sauraient pas faire tourner.
 *
 * **Publier, c'est changer de version.** Le paquet est fabriqué par le
 * déploiement du site (`scripts/ota-paquet.mjs`) et désigné par l'API ; un
 * téléphone ne le télécharge que si son numéro diffère du sien. Ce script
 * incrémente donc la version, vérifie que le paquet se construit, et rappelle
 * la suite : valider, pousser sur `main`.
 *
 * ```bash
 * pnpm ota             # version corrective : 1.0.6 → 1.0.7
 * pnpm ota -- --essai  # construit le paquet, sans changer de version
 * ```
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RACINE, "apps", "web");
const essai = process.argv.includes("--essai");

const chemin = join(WEB, "package.json");
const paquet = JSON.parse(readFileSync(chemin, "utf8"));
const precedente = paquet.version;

const [majeur, mineur, corrective] = precedente.split(".").map(Number);
if ([majeur, mineur, corrective].some(Number.isNaN)) {
  throw new Error(`Version illisible dans ${chemin} : ${precedente}`);
}
const suivante = essai ? precedente : `${majeur}.${mineur}.${corrective + 1}`;

if (!essai) {
  paquet.version = suivante;
  writeFileSync(chemin, `${JSON.stringify(paquet, null, 2)}\n`, "utf8");
}

console.log(
  essai
    ? `\nEssai du paquet ${suivante}, sans changer de version.\n`
    : `\nMise à jour à chaud : ${precedente} → ${suivante}\n`,
);

try {
  execFileSync("pnpm", ["--filter", "@uno/web", "build"], {
    cwd: RACINE,
    stdio: "inherit",
    env: { ...process.env, OTA_PAQUET: "1" },
  });
} catch (erreur) {
  // Un paquet qui ne se construit pas ne doit pas laisser un numéro consommé.
  if (!essai) {
    paquet.version = precedente;
    writeFileSync(chemin, `${JSON.stringify(paquet, null, 2)}\n`, "utf8");
  }
  throw erreur;
} finally {
  // Le paquet de 10 Mo n'a rien à faire dans `dist/` : `cap sync` l'y
  // prendrait pour l'embarquer dans les binaires.
  rmSync(join(WEB, "dist", "ota"), { recursive: true, force: true });
}

console.log(
  essai
    ? "\nLe paquet se construit. Rien n'a changé.\n"
    : `
Le paquet ${suivante} se construit. Pour le publier :

  1. valider apps/web/package.json (et le reste du changement) ;
  2. pousser sur main : le déploiement du site fabrique le paquet,
     l'API le propose aux téléphones.

Ils le prendront au lancement suivant ; s'il plante au démarrage, le
plugin revient seul à la version précédente. Pour retirer une version,
publier la précédente sous un numéro plus élevé.
`,
);
