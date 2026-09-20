/**
 * Les langues de la ligue (I18N-001).
 *
 * Bruxelles joue en trois langues, et la ligue s'adresse à des gens qui ne
 * partagent pas la même. Le **français est la référence** : c'est la langue
 * dans laquelle les écrans sont écrits, et celle vers laquelle on retombe
 * quand une traduction manque. Ce choix n'est pas anodin — il veut dire qu'une
 * clé oubliée s'affiche en français plutôt qu'en `session.title.missing`.
 */

export const LOCALES = ["fr", "en", "nl"] as const;

export type Locale = (typeof LOCALES)[number];

/** La langue de référence : celle des écrans, et le refuge des clés manquantes. */
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * Le nom de chaque langue **dans cette langue**.
 *
 * Un sélecteur qui traduit les noms de langues oblige à savoir lire la langue
 * qu'on veut quitter. « Nederlands » se reconnaît par quelqu'un qui ne lit ni
 * le français ni l'anglais ; « Néerlandais » ne l'aide pas.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  nl: "Nederlands",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * La meilleure langue pour un en-tête `Accept-Language`, ou pour la liste que
 * donne un navigateur.
 *
 * On ne compare que le préfixe : `nl-BE` et `nl-NL` sont tous deux du
 * néerlandais, et la ligue ne distingue pas les variantes régionales.
 */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const candidate of preferred) {
    const base = candidate.split("-")[0]?.toLowerCase();
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
