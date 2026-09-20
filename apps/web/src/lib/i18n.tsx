import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, isLocale, pickLocale, type Locale } from "@uno/shared";

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

  const t = useCallback<Traduire>(
    (cle, valeurs) => {
      const dictionnaire = DICTIONNAIRES[active];
      // Le français sert de refuge : une clé manquante affiche une phrase
      // lisible, pas un identifiant technique.
      const texte = lire(dictionnaire, cle) ?? lire(fr, cle);
      if (texte === undefined) {
        // Ni dans la langue, ni en français : la clé n'existe pas. En
        // développement on veut le savoir tout de suite ; en production, mieux
        // vaut afficher la clé qu'une page blanche.
        if (import.meta.env.DEV) {
          throw new Error(`Clé de traduction inconnue : ${cle}`);
        }
        return cle;
      }
      return interpoler(texte, valeurs);
    },
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
