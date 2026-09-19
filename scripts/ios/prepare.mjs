/**
 * Réglages iOS que `cap sync` ne sait pas poser (PHOTO-001, ANN-005).
 *
 * `Info.plist` est généré par `cap add ios` et jamais réécrit ensuite : tout
 * ce qu'on y ajoute à la main survit aux synchronisations — jusqu'au jour où
 * le projet est régénéré, et disparaît alors en silence.
 *
 * Or son absence ne se voit pas à la construction. Sans
 * `NSCameraUsageDescription`, iOS refuse la caméra **sans afficher la moindre
 * boîte de dialogue** : l'écran de photo annonce « l'accès a été refusé » à un
 * joueur qui n'a rien refusé, et l'on cherche du côté du code. Apple rejette
 * d'ailleurs le binaire pour la même raison.
 *
 * Ce script pose donc les clés après chaque synchronisation, et ne fait rien
 * si elles sont déjà là. Il est volontairement idempotent et silencieux : sa
 * place est dans une chaîne de commandes, pas dans une liste de choses à
 * penser.
 *
 *   node scripts/ios/prepare.mjs
 *
 * Il s'arrête sans erreur quand `apps/web/ios` n'existe pas — sur une machine
 * qui n'est pas un Mac, c'est l'état normal.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const plistPath = join(root, "apps/web/ios/App/App/Info.plist");

/**
 * Les textes sont ceux que l'utilisateur lit dans la demande de permission.
 *
 * Apple les relit à la revue et refuse une formulation vague : « cette
 * application a besoin de la caméra » ne dit pas pourquoi. Chacun nomme donc
 * l'usage précis, en français, puisque c'est la langue de l'application.
 */
const KEYS = [
  {
    key: "NSCameraUsageDescription",
    value:
      "UNO League utilise l'appareil photo pour prendre la photo de votre " +
      "carte de joueur. L'image est analysée sur votre appareil et n'est " +
      "envoyée qu'après votre validation.",
  },
  {
    key: "NSPhotoLibraryUsageDescription",
    value:
      "UNO League accède à vos photos pour que vous puissiez en choisir une " +
      "comme photo de carte de joueur, si vous préférez ne pas la prendre sur " +
      "le moment.",
  },
];

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let plist;
try {
  plist = await readFile(plistPath, "utf8");
} catch {
  console.log(
    "Projet iOS absent : rien à préparer. Générez-le sur un Mac " +
      "(`pnpm exec cap add ios`), puis relancez cette commande.",
  );
  process.exit(0);
}

const missing = KEYS.filter(({ key }) => !plist.includes(`<key>${key}</key>`));

if (missing.length === 0) {
  console.log("Info.plist : les permissions sont déjà en place.");
  process.exit(0);
}

/*
 * L'insertion se fait avant la dernière fermeture de `dict`, c'est-à-dire à la
 * fin du dictionnaire racine. Éditer un plist sans analyseur XML n'est
 * acceptable que parce que ce fichier-là est produit par un gabarit connu et
 * n'a pas de structure imbriquée à cet endroit.
 */
const close = plist.lastIndexOf("</dict>");
if (close === -1) {
  console.error("Info.plist illisible : aucune fermeture </dict> trouvée.");
  process.exit(1);
}

const bloc = missing
  .map(
    ({ key, value }) =>
      `\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>\n`,
  )
  .join("");

await writeFile(plistPath, plist.slice(0, close) + bloc + plist.slice(close));

for (const { key } of missing) console.log(`Info.plist : ${key} ajouté.`);
