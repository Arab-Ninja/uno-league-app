import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  erreursParChamp,
  isLocale,
  pickLocale,
  poseLangueDeValidation,
  type GameModeId,
  type Locale,
} from "@uno/shared";
import type { ZodError } from "zod";

import { langueActive, poseLangueDeFormatage } from "@/lib/format.js";
import { fr, type Dictionnaire } from "@/locales/fr.js";
import { en } from "@/locales/en.js";
import { nl } from "@/locales/nl.js";

/**
 * Les trois langues de la ligue, côté interface (I18N-001).
 *
 * **Pourquoi pas de bibliothèque.** `react-i18next` et consorts apportent le
 * chargement paresseux, les formats de date et une machinerie de pluriels qui
 * couvre le russe et l'arabe. Ici il y a trois langues européennes, un seul
 * pluriel (singulier / pluriel), et les dates passent déjà par `Intl`. Le peu
 * qu'il reste tient en cinquante lignes, et une dépendance de moins est une
 * dépendance qui ne casse pas au prochain changement de version majeure.
 *
 * **Le français est la référence.** `fr.ts` définit la forme du dictionnaire ;
 * les deux autres doivent s'y conformer, et TypeScript le vérifie. Une clé
 * oubliée en néerlandais retombe sur le français — jamais sur la clé elle-même,
 * qui donnerait au joueur un `wallet.empty.title` en pleine page.
 */

export type { Dictionnaire };
export type Cle = KeysOf<Dictionnaire>;

/** Les chemins pointés d'un objet imbriqué : `wallet.empty.title`. */
type KeysOf<T, Prefixe extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefixe}${K}`
    : KeysOf<T[K], `${Prefixe}${K}.`>;
}[keyof T & string];

const DICTIONNAIRES: Record<Locale, Dictionnaire> = { fr, en, nl };

/** Descend un chemin pointé, sans exploser si la branche manque. */
function lire(source: unknown, chemin: string): string | undefined {
  let courant: unknown = source;
  for (const partie of chemin.split(".")) {
    if (typeof courant !== "object" || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[partie];
  }
  return typeof courant === "string" ? courant : undefined;
}

/**
 * Remplace les jetons `{nom}` par leur valeur.
 *
 * Un jeton sans valeur est laissé tel quel plutôt qu'effacé : « il reste
 * {count} places » est un bogue visible, alors qu'« il reste places » ressemble
 * à une phrase et passerait inaperçu.
 */
function interpoler(
  texte: string,
  valeurs?: Record<string, string | number>,
): string {
  if (!valeurs) return texte;
  return texte.replace(/\{(\w+)\}/g, (entier, nom: string) =>
    nom in valeurs ? String(valeurs[nom]) : entier,
  );
}

export type Traduire = (
  cle: Cle,
  valeurs?: Record<string, string | number>,
) => string;

/**
 * Le cœur de la traduction, sans React.
 *
 * Le français sert de refuge : une clé manquante affiche une phrase lisible,
 * pas un identifiant technique. Ni dans la langue, ni en français : la clé
 * n'existe pas — en développement on veut le savoir tout de suite, en
 * production mieux vaut afficher la clé qu'une page blanche.
 */
function resoudre(
  locale: Locale,
  cle: Cle,
  valeurs?: Record<string, string | number>,
): string {
  const texte = lire(DICTIONNAIRES[locale], cle) ?? lire(fr, cle);
  if (texte === undefined) {
    if (import.meta.env.DEV) {
      throw new Error(`Clé de traduction inconnue : ${cle}`);
    }
    return cle;
  }
  return interpoler(texte, valeurs);
}

/**
 * `t()` hors composant, pour les modules qui n'ont pas de crochets.
 *
 * `push.ts` lève une exception dont le message s'affiche tel quel : il lui
 * faut la langue du joueur sans pouvoir appeler `useT()`.
 */
export function traduire(
  cle: Cle,
  valeurs?: Record<string, string | number>,
): string {
  return resoudre(langueActive(), cle, valeurs);
}

/**
 * Les erreurs d'un formulaire validé sur place, un message par champ, dans
 * la langue de l'écran (I18N-002).
 */
export function erreursDuFormulaire(erreur: ZodError): Record<string, string> {
  return erreursParChamp(erreur, langueActive());
}

type Contexte = {
  locale: Locale;
  t: Traduire;
};

const I18nContext = createContext<Contexte | null>(null);

/**
 * La langue à afficher avant que le compte ait répondu.
 *
 * Celle du navigateur, donc — c'est tout ce qu'on sait d'un visiteur qui n'a
 * pas encore de compte, et c'est déjà mieux que du français imposé à un
 * néerlandophone.
 */
export function localeDuNavigateur(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  return pickLocale(navigator.languages ?? [navigator.language]);
}

export function I18nProvider({
  locale,
  children,
}: {
  /** Celle du compte quand il est chargé, celle du navigateur sinon. */
  locale?: string | null;
  children: ReactNode;
}) {
  const active: Locale = isLocale(locale) ? locale : localeDuNavigateur();

  /*
   * Posé pendant le rendu, et non dans un effet : les enfants sont rendus
   * juste après ce corps de fonction, et un effet n'aurait lieu qu'après —
   * le premier affichage aurait porté les dates de la langue précédente.
   * L'opération est idempotente, donc sans danger au double rendu de
   * StrictMode.
   */
  poseLangueDeFormatage(active);
  poseLangueDeValidation(active);

  const t = useCallback<Traduire>(
    (cle, valeurs) => resoudre(active, cle, valeurs),
    [active],
  );

  const valeur = useMemo<Contexte>(() => ({ locale: active, t }), [active, t]);

  return <I18nContext.Provider value={valeur}>{children}</I18nContext.Provider>;
}

export function useI18n(): Contexte {
  const contexte = useContext(I18nContext);
  if (!contexte) {
    throw new Error("useI18n hors de I18nProvider");
  }
  return contexte;
}

/** Raccourci : `const t = useT()` puis `t("wallet.empty.title")`. */
export function useT(): Traduire {
  return useI18n().t;
}

/**
 * Les libellés du domaine, dans la langue active.
 *
 * `t("libelles.position.GB")` marcherait aussi, mais les libellés se lisent
 * presque toujours par une variable — `L.position[joueur.position]` — et la
 * clé pointée ne se construit pas comme ça sans forcer le type. Une lecture
 * directe de l'objet le fait, et TypeScript garantit déjà qu'aucune des trois
 * langues n'a de trou : `Dictionnaire` les oblige à la même forme.
 */
export function useLibelles(): Dictionnaire["libelles"] {
  return DICTIONNAIRES[useI18n().locale].libelles;
}

/**
 * Le nom d'un mode de jeu, à partir de son identifiant brut.
 *
 * Plusieurs écrans n'ont que `modeId`, une chaîne venue du serveur, là où
 * `L.gameMode` attend un identifiant connu. Un mode inconnu renvoie son
 * identifiant : une pastille qui affiche `bigfoot` se remarque, une pastille
 * vide non.
 */
export function useNomDeMode(): (id: string) => string {
  const L = useLibelles();
  return useCallback((id: string) => L.gameMode[id as GameModeId] ?? id, [L]);
}
