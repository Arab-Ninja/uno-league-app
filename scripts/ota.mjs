import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * **L'adresse de l'API est injectée à la compilation, et son absence est
 * silencieuse.**
 *
 * Sans `VITE_API_URL`, `apiUrl()` (apps/web/src/lib/trpc.ts) retombe sur
 * `/trpc`, une adresse relative. En développement web c'est voulu : Vite
 * relaie. Mais dans l'application empaquetée, l'origine du WebView est
 * `https://localhost` — chaque appel partirait donc vers un serveur qui
 * n'existe pas, et le bundle rendrait l'application inutilisable sur tous les
 * téléphones qui le reçoivent, sans la moindre erreur à la construction.
 */
const API_PRODUCTION = "https://unoleague.be";
const API = process.env["VITE_API_URL"] ?? API_PRODUCTION;

const essai = process.argv.includes("--essai");
const forcerApi = process.argv.includes("--forcer-api");

/*
 * Vérifier que l'adresse figure dans le bundle ne prouve rien : Vite y injecte
 * fidèlement ce qu'on lui donne, fût-ce `https://localhost` ou une faute de
 * frappe. Ce contrôle-là a laissé passer un bundle pointant vers une adresse
 * inexistante, publié sur le canal par défaut. Il faut donc vérifier *quelle*
 * adresse, pas seulement qu'il y en a une.
 */
if (CANAL === "production" && API !== API_PRODUCTION && !forcerApi) {
  console.error(
    `\nL'adresse ${API} n'est pas celle de la production (${API_PRODUCTION}),` +
      `\net le canal « ${CANAL} » sert tous les téléphones. Rien n'a été envoyé.` +
      "\n\nSi c'est voulu, ajoutez --forcer-api.\n",
  );
  process.exit(1);
}

function lance(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", cwd: RACINE, ...options });
}

/** Le bundle construit porte-t-il bien l'adresse de l'API ? */
function verifieAdresse() {
  const assets = join(WEB, "dist", "assets");
  const trouvee = readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .some((f) => readFileSync(join(assets, f), "utf8").includes(API));
  if (!trouvee) {
    // Ce cas-ci reste utile : il attrape une construction qui aurait perdu la
    // variable en chemin, et dont les appels partiraient vers l'origine du
    // WebView.
    throw new Error(
      `L'adresse ${API} est absente du bundle construit.\n` +
        "Publier celui-ci rendrait l'application inutilisable : ses appels\n" +
        "d'API partiraient vers l'origine du WebView. Rien n'a été envoyé.",
    );
  }
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
console.log(`\nMise à jour à chaud : ${precedente} → ${suivante}`);
console.log(`API : ${API}\n`);

// La version est écrite avant la construction : `capacitor.config.ts` lit
// `npm_package_version`, et c'est ce numéro que le bundle portera.
paquet.version = suivante;
writeFileSync(chemin, `${JSON.stringify(paquet, null, 2)}\n`, "utf8");

try {
  lance("pnpm", ["--filter", "@uno/web", "build"], {
    env: { ...process.env, VITE_API_URL: API },
  });
  verifieAdresse();
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
