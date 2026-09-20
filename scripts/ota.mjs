import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Publier une mise à jour à chaud (Capgo).
 *
 * Le contenu web est embarqué dans le binaire ; sans ce mécanisme, la moindre
 * correction de texte imposerait un nouveau dépôt sur Google Play et une revue
 * Apple de un à trois jours. Ici, elle atteint les téléphones au lancement
 * suivant.
 *
 * Ce que cela **ne** couvre pas : tout ce qui est natif — nouveau plugin,
 * icône, permissions, version minimale d'OS. Ces changements-là repassent par
 * les stores.
 *
 * ```bash
 * pnpm ota            # version corrective : 1.0.1 → 1.0.2
 * pnpm ota -- --essai # construit et montre la commande, sans rien envoyer
 * ```
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RACINE, "apps", "web");
const APP_ID = "app.unoleague.mobile";
const CANAL = "production";

const essai = process.argv.includes("--essai");

function lance(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", cwd: RACINE, ...options });
}

/**
 * La version du bundle doit être **strictement supérieure** à celle du
 * binaire installé.
 *
 * Le canal est réglé sur « Updates Under Native : No » : Capgo accepte un
 * bundle de version inférieure ou égale, puis ne le distribue jamais. On perd
 * alors une demi-journée à chercher pourquoi le téléphone ne voit rien.
 *
 * `apps/web/package.json` porte cette version, et `capacitor.config.ts` la
 * recopie dans le binaire au moment du `cap sync`. Le compteur est donc le
 * même des deux côtés : on l'incrémente ici, et le prochain paquet natif
 * repartira de là.
 */
function versionSuivante() {
  const chemin = join(WEB, "package.json");
  const paquet = JSON.parse(readFileSync(chemin, "utf8"));
  const [majeur, mineur, corrective] = paquet.version.split(".").map(Number);
  if ([majeur, mineur, corrective].some(Number.isNaN)) {
    throw new Error(`Version illisible dans ${chemin} : ${paquet.version}`);
  }
  const suivante = `${majeur}.${mineur}.${corrective + 1}`;
  return { chemin, paquet, precedente: paquet.version, suivante };
}

const { chemin, paquet, precedente, suivante } = versionSuivante();
console.log(`\nMise à jour à chaud : ${precedente} → ${suivante}\n`);

// La version est écrite avant la construction : `capacitor.config.ts` lit
// `npm_package_version`, et c'est ce numéro que le bundle portera.
paquet.version = suivante;
writeFileSync(chemin, `${JSON.stringify(paquet, null, 2)}\n`, "utf8");

try {
  lance("pnpm", ["--filter", "@uno/web", "build"]);
} catch (erreur) {
  // Une construction ratée ne doit pas laisser derrière elle un numéro de
  // version consommé : le prochain essai repartirait de trop haut, et le
  // décalage avec le binaire natif ne se rattrape plus.
  paquet.version = precedente;
  writeFileSync(chemin, `${JSON.stringify(paquet, null, 2)}\n`, "utf8");
  throw erreur;
}

const args = [
  "--yes",
  "@capgo/cli@latest",
  "bundle",
  "upload",
  APP_ID,
  `--channel=${CANAL}`,
  `--bundle=${suivante}`,
  "--path=dist",
];

if (essai) {
  console.log("\nEssai — rien n'a été envoyé. La commande aurait été :\n");
  console.log(`  cd apps/web && npx ${args.slice(1).join(" ")}\n`);
  paquet.version = precedente;
  writeFileSync(chemin, `${JSON.stringify(paquet, null, 2)}\n`, "utf8");
  process.exit(0);
}

// Le CLI cherche `capacitor.config.ts` à côté de lui : il faut donc le lancer
// depuis `apps/web`, jamais depuis la racine du dépôt.
lance("npx", args, { cwd: WEB });

console.log(`
Publié sur le canal « ${CANAL} ».

Les téléphones la prendront au **prochain lancement**, pas tout de suite :
directUpdate est à false pour ne jamais couper une session en cours.

Si la nouvelle version plante au démarrage, le plugin revient seul à la
précédente (resetWhenUpdate). Pour la retirer à la main :

  cd apps/web && npx @capgo/cli@latest bundle delete ${suivante} ${APP_ID}

Pensez à valider le changement de version de apps/web/package.json.
`);
