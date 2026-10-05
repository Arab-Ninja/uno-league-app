import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

/**
 * Paquet de mise à jour à chaud, fabriqué au déploiement du site (OTA-001).
 *
 * Les mises à jour ne passent plus par le service payant de Capgo : le
 * plugin de l'application interroge notre API (`/trpc/app-update`), qui lit
 * `ota/manifest.json` sur le site et désigne le paquet à télécharger. Ce
 * script fabrique les deux, à la fin de `vite build`, dans `dist/ota/`.
 *
 * **Pourquoi une seconde construction.** Le site appelle l'API par un chemin
 * relatif (`/trpc`) : il est servi par le même domaine. Dans l'application,
 * l'origine est `https://localhost` — le même chemin y mènerait nulle part.
 * Le paquet est donc reconstruit avec `VITE_API_URL`, comme le fait le
 * workflow iOS pour le binaire.
 *
 * **Pourquoi seulement au déploiement.** Hors de Render, `dist/` part dans
 * les binaires par `cap sync` : un paquet de 10 Mo y serait embarqué pour
 * rien. Le script ne fait donc rien sans `RENDER=true` (posée par Render) ou
 * `OTA_PAQUET=1` (pour l'essayer sur un poste).
 *
 * **Ce qui déclenche une mise à jour, c'est la version**, celle de
 * `apps/web/package.json`. Un déploiement sans changement de version
 * reconstruit le paquet, mais les téléphones déjà à ce numéro ne le
 * reprennent pas : `pnpm ota` incrémente la version pour publier.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RACINE, "apps", "web");
const DIST = join(WEB, "dist");
const TEMPORAIRE = join(WEB, "dist-app");

/** L'adresse que le paquet appelle : celle de la production. */
export const API_PRODUCTION = "https://unoleague.be";

// ---------------------------------------------------------------------------
// Archive ZIP
//
// Écrite à la main plutôt que par une dépendance : le format est simple, et
// le build du site n'a ainsi rien de plus à installer. Entrées compressées
// (deflate) ou stockées telles quelles quand la compression n'apporte rien —
// les deux méthodes que lisent SSZipArchive (iOS) et ZipInputStream
// (Android). Les tailles sont dans l'en-tête local, sans descripteur de
// données : ZipInputStream les y attend.
// ---------------------------------------------------------------------------

const TABLE_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const octet of octets) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function fichiers(dossier) {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    return entree.isDirectory() ? fichiers(chemin) : [chemin];
  });
}

/**
 * Archive le contenu d'un dossier, `index.html` à la racine de l'archive.
 * `garder` filtre les chemins relatifs (séparés par `/`).
 */
export function zipDossier(dossier, garder = () => true) {
  const locaux = [];
  const central = [];
  let decalage = 0;

  const chemins = fichiers(dossier)
    .map((chemin) => relative(dossier, chemin).split(sep).join("/"))
    .filter(garder)
    .sort();

  for (const nom of chemins) {
    const donnees = readFileSync(join(dossier, nom));
    const compresse = deflateRawSync(donnees, { level: 9 });
    const stocke = compresse.length >= donnees.length;
    const contenu = stocke ? donnees : compresse;
    const crc = crc32(donnees);
    const nomOctets = Buffer.from(nom, "utf8");

    // Date fixe (1er janvier 2020) : deux constructions identiques donnent la
    // même archive, donc la même empreinte.
    const heure = 0;
    const jour = ((2020 - 1980) << 9) | (1 << 5) | 1;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version requise
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(stocke ? 0 : 8, 8);
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(jour, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contenu.length, 18);
    local.writeUInt32LE(donnees.length, 22);
    local.writeUInt16LE(nomOctets.length, 26);
    local.writeUInt16LE(0, 28);

    const entete = Buffer.alloc(46);
    entete.writeUInt32LE(0x02014b50, 0);
    entete.writeUInt16LE(20, 4); // version auteur
    entete.writeUInt16LE(20, 6); // version requise
    entete.writeUInt16LE(0x0800, 8);
    entete.writeUInt16LE(stocke ? 0 : 8, 10);
    entete.writeUInt16LE(heure, 12);
    entete.writeUInt16LE(jour, 14);
    entete.writeUInt32LE(crc, 16);
    entete.writeUInt32LE(contenu.length, 20);
    entete.writeUInt32LE(donnees.length, 24);
    entete.writeUInt16LE(nomOctets.length, 28);
    // champs supplémentaires, commentaire, disque, attributs : à zéro
    entete.writeUInt32LE(decalage, 42);

    locaux.push(local, nomOctets, contenu);
    central.push(entete, nomOctets);
    decalage += local.length + nomOctets.length + contenu.length;
  }

  const tailleCentral = central.reduce((total, b) => total + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(chemins.length, 8);
  fin.writeUInt16LE(chemins.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);

  return Buffer.concat([...locaux, ...central, fin]);
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Le paquet porte-t-il l'adresse de l'API ? Sinon il serait inutilisable. */
function verifieAdresse(dossier) {
  const assets = join(dossier, "assets");
  const trouvee = readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .some((f) =>
      readFileSync(join(assets, f), "utf8").includes(API_PRODUCTION),
    );
  if (!trouvee) {
    throw new Error(
      `L'adresse ${API_PRODUCTION} est absente du paquet construit : ses ` +
        "appels partiraient vers l'origine du WebView.",
    );
  }
}

/**
 * Construit le paquet de l'application et l'écrit dans `dist/ota/`.
 * Renvoie le manifeste publié.
 */
export function fabriquePaquet() {
  const paquet = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8"));
  const version = paquet.version;
  const natifMinimum = paquet.unoleague?.natifMinimum ?? version;

  execFileSync(
    process.execPath,
    [
      join(WEB, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--outDir",
      TEMPORAIRE,
      "--emptyOutDir",
      "--logLevel",
      "warn",
    ],
    {
      cwd: WEB,
      stdio: "inherit",
      env: { ...process.env, VITE_API_URL: API_PRODUCTION },
    },
  );

  try {
    verifieAdresse(TEMPORAIRE);
    // Les cartes de sources ne servent qu'au débogage : 5 Mo de moins à
    // télécharger pour chaque téléphone.
    const archive = zipDossier(TEMPORAIRE, (nom) => !nom.endsWith(".map"));
    const checksum = createHash("sha256").update(archive).digest("hex");
    const fichier = `uno-${version}-${checksum.slice(0, 10)}.zip`;

    const sortie = join(DIST, "ota");
    rmSync(sortie, { recursive: true, force: true });
    mkdirSync(sortie, { recursive: true });
    writeFileSync(join(sortie, fichier), archive);

    const manifeste = {
      version,
      fichier,
      checksum,
      natifMinimum,
      taille: archive.length,
    };
    writeFileSync(
      join(sortie, "manifest.json"),
      `${JSON.stringify(manifeste, null, 2)}\n`,
    );
    return manifeste;
  } finally {
    rmSync(TEMPORAIRE, { recursive: true, force: true });
  }
}

const lanceDirectement =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (lanceDirectement) {
  if (process.env["RENDER"] !== "true" && process.env["OTA_PAQUET"] !== "1") {
    console.log(
      "Paquet de mise à jour : fabriqué au déploiement seulement " +
        "(OTA_PAQUET=1 pour l'essayer).",
    );
  } else {
    const debut = Date.now();
    const { version, fichier, taille } = fabriquePaquet();
    const mo = (taille / 1024 / 1024).toFixed(1);
    const secondes = ((Date.now() - debut) / 1000).toFixed(0);
    console.log(
      `Paquet de mise à jour ${version} : dist/ota/${fichier} (${mo} Mo, ${secondes} s)`,
    );
  }
}
