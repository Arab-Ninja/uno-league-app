import {
  DEFAULT_LOCALE,
  isLocale,
  pickLocale,
  remplirGabarit,
  type ErrorTemplate,
  type ErrorValue,
  type Locale,
} from "@uno/shared";
import { CATALOGUE_ERREURS, LIBELLES_ERREURS } from "./erreurs.js";
import { CATALOGUE_ECRITURES } from "./ecritures.js";
import { CATALOGUE_NOTIFICATIONS } from "./notifications.js";

/**
 * Tout ce que le serveur écrit à un joueur : ses refus, et ce qu'il lui
 * annonce. Une même clé ne peut pas porter deux traductions — le test du
 * catalogue le vérifie.
 */
export const CATALOGUE = {
  ...CATALOGUE_ERREURS,
  ...CATALOGUE_NOTIFICATIONS,
  ...CATALOGUE_ECRITURES,
};

/**
 * Les textes du serveur dans la langue du lecteur (I18N-002).
 *
 * Le serveur écrit en français ; c'est ici, au moment de répondre, que le
 * texte change de langue. Les services n'ont donc jamais à connaître la
 * langue de qui les appelle — ce qui aurait voulu dire la faire descendre
 * jusqu'au fond de chaque transaction.
 */

/** L'en-tête par lequel l'application dit dans quelle langue elle s'affiche. */
export const LOCALE_HEADER = "x-uno-locale";

/**
 * La langue d'une requête.
 *
 * Dans l'ordre :
 *  1. celle que l'application déclare — c'est celle de l'écran que le joueur
 *     a sous les yeux, y compris avant qu'il ait un compte ;
 *  2. celle du compte, pour les clients qui ne la déclarent pas encore (une
 *     version de l'application antérieure à cet en-tête) ;
 *  3. celle du navigateur ;
 *  4. le français.
 */
export function localeDeRequete(
  headers: Record<string, string | string[] | undefined>,
  compte: Locale | null | undefined,
): Locale {
  const declaree = headers[LOCALE_HEADER];
  if (isLocale(declaree)) return declaree;
  if (compte) return compte;
  const accept = headers["accept-language"];
  if (typeof accept === "string" && accept.length > 0) {
    return pickLocale(
      accept.split(",").map((partie) => partie.split(";")[0]!.trim()),
    );
  }
  return DEFAULT_LOCALE;
}

/**
 * Un message dans une langue. Un texte absent du catalogue reste en
 * français : lisible par une partie des joueurs plutôt que par personne — et
 * le test du catalogue empêche que cela arrive à un message connu.
 */
export function traduireErreur(
  locale: Locale,
  texte: string,
  valeurs: Record<string, ErrorValue> = {},
): string {
  if (locale === "fr") return remplirGabarit(texte, valeurs);
  const traduction = CATALOGUE[texte]?.[locale];
  if (traduction === undefined) return remplirGabarit(texte, valeurs);
  return remplirGabarit(traduction, valeurs, LIBELLES_ERREURS[locale], locale);
}

export function traduireModele(locale: Locale, modele: ErrorTemplate): string {
  return traduireErreur(locale, modele.gabarit, modele.valeurs);
}

/**
 * Le libellé d'une écriture — portefeuille ou caisse de club —, en français.
 *
 * Il est enregistré tel quel, et c'est voulu : le relevé d'un compte est un
 * document, et il doit se lire de la même façon dans dix ans, quelle que soit
 * l'évolution du code. La traduction se fait donc **à la lecture**
 * (`traduireEcriture`), en retrouvant le gabarit dans le texte — ce qui
 * traduit aussi les écritures passées, sans migration.
 *
 * Écrire le libellé par cette fonction plutôt qu'en gabarit littéral
 * JavaScript le rend visible au relevé des traductions : un libellé sans
 * traduction fait échouer la suite.
 */
export function ecriture(
  texte: string,
  valeurs: Record<string, string | number> = {},
): string {
  return remplirGabarit(texte, valeurs);
}

/** Les gabarits à trous, du plus précis au plus vague. */
const MOTIFS_ECRITURES = Object.keys(CATALOGUE_ECRITURES)
  .filter((gabarit) => /\{\w+\}/.test(gabarit))
  .sort(
    (a, b) =>
      b.replace(/\{\w+\}/g, "").length - a.replace(/\{\w+\}/g, "").length,
  )
  .map((gabarit) => ({
    gabarit,
    motif: new RegExp(
      "^" +
        gabarit
          .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
          .replace(/\{(\w+)\}/g, "(?<$1>.+?)") +
        "$",
    ),
  }));

/**
 * Un libellé d'écriture dans une langue.
 *
 * Le texte est d'abord cherché tel quel, puis parmi les gabarits ; les
 * valeurs qu'il porte sont à leur tour traduites quand elles sont connues
 * — « Place libérée — défi club » a deux morceaux, et tous deux se
 * traduisent. Un libellé inconnu (le motif qu'un administrateur a saisi)
 * reste tel quel.
 */
export function traduireEcriture(
  locale: Locale,
  texte: string,
  profondeur = 0,
): string {
  if (locale === "fr") return texte;
  const direct = CATALOGUE[texte]?.[locale];
  if (direct !== undefined) return direct;
  if (profondeur > 1) return texte;

  for (const { gabarit, motif } of MOTIFS_ECRITURES) {
    const trouve = motif.exec(texte);
    if (!trouve?.groups) continue;
    const valeurs: Record<string, string> = {};
    for (const [nom, valeur] of Object.entries(trouve.groups)) {
      valeurs[nom] = traduireEcriture(locale, valeur, profondeur + 1);
    }
    return remplirGabarit(
      CATALOGUE_ECRITURES[gabarit]![locale],
      valeurs,
      LIBELLES_ERREURS[locale],
      locale,
    );
  }
  return texte;
}
