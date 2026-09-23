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
  const traduction = CATALOGUE_ERREURS[texte]?.[locale];
  if (traduction === undefined) return remplirGabarit(texte, valeurs);
  return remplirGabarit(traduction, valeurs, LIBELLES_ERREURS[locale]);
}

export function traduireModele(locale: Locale, modele: ErrorTemplate): string {
  return traduireErreur(locale, modele.gabarit, modele.valeurs);
}
