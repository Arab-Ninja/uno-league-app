import { DEFAULT_LOCALE, UNO_PER_EUR, formatEur, formatUno } from "@uno/shared";
import type { Locale } from "@uno/shared";

/** Formatage d'affichage. Aucune règle métier n'est décidée ici (P-004). */

export { formatEur, formatUno, UNO_PER_EUR };

/**
 * Les codes de langue complets, région comprise (I18N-001).
 *
 * La région n'est pas décorative : elle décide l'ordre des nombres d'une date
 * et le séparateur décimal. `en` seul donnerait « 9/8/2026 » à l'américaine,
 * là où la ligue est belge et écrit 8/9. Le néerlandais et le français
 * prennent donc leur variante belge, et l'anglais sa variante britannique,
 * qui écrit les dates dans le même ordre.
 */
const BCP47: Record<Locale, string> = {
  fr: "fr-BE",
  en: "en-GB",
  nl: "nl-BE",
};

/**
 * La langue dans laquelle formater, posée par `I18nProvider`.
 *
 * Une variable de module plutôt qu'un contexte : ces fonctions sont appelées
 * depuis une cinquantaine d'endroits, dont plusieurs hors composant (tri,
 * agrégats, libellés de listes). En faire des crochets obligerait à les
 * remonter tous, pour une valeur qui ne change qu'au changement de langue.
 */
let langue: Locale = DEFAULT_LOCALE;

/** Appelé par `I18nProvider` quand la langue active change. */
export function poseLangueDeFormatage(valeur: Locale): void {
  langue = valeur;
}

/**
 * Les formateurs `Intl` coûtent cher à construire et sont réutilisés à chaque
 * ligne d'une liste : on les garde, par langue et par forme.
 */
const formateurs = new Map<string, Intl.DateTimeFormat>();

function dateFormat(
  nom: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cle = `${langue}:${nom}`;
  let formateur = formateurs.get(cle);
  if (!formateur) {
    formateur = new Intl.DateTimeFormat(BCP47[langue], options);
    formateurs.set(cle, formateur);
  }
  return formateur;
}

/**
 * Une date de calendrier (YYYY-MM-DD) vers un objet Date, à midi UTC.
 *
 * Renvoie `null` plutôt que de laisser passer une date invalide : un
 * formateur qui lève « Invalid time value » vide l'écran entier, alors que
 * l'appelant n'avait qu'une chaîne mal formée à afficher. Une mauvaise donnée
 * ne doit pas coûter la page.
 */
function calendarDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "lundi 8 septembre" à partir d'une date ISO (YYYY-MM-DD). */
export function formatLongDate(isoDate: string): string {
  const date = calendarDate(isoDate);
  return date
    ? dateFormat("long", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(date)
    : isoDate;
}

export function formatShortDate(isoDate: string): string {
  const date = calendarDate(isoDate);
  return date
    ? dateFormat("court", { day: "2-digit", month: "2-digit" }).format(date)
    : isoDate;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : dateFormat("horodate", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

/** L'initiale d'un jour de la semaine : « L », « M » — ou « M », « T ». */
export function formatWeekdayNarrow(date: Date): string {
  return dateFormat("jourEtroit", { weekday: "narrow" }).format(date);
}

/** « septembre 2026 », tel qu'il s'écrit en tête du calendrier. */
export function formatMonth(year: number, month: number): string {
  return dateFormat("mois", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

const relatifs = new Map<Locale, Intl.RelativeTimeFormat>();

function relatif(): Intl.RelativeTimeFormat {
  let formateur = relatifs.get(langue);
  if (!formateur) {
    formateur = new Intl.RelativeTimeFormat(BCP47[langue], {
      numeric: "auto",
      style: "short",
    });
    relatifs.set(langue, formateur);
  }
  return formateur;
}

/**
 * "il y a 3 j", "à l'instant".
 *
 * `Intl.RelativeTimeFormat` porte les trois langues sans dictionnaire : en
 * `numeric: "auto"`, zéro minute devient « maintenant » plutôt que « il y a 0
 * minute », et le pluriel est celui de la langue.
 */
export function formatRelative(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(deltaMs)) return iso;

  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return relatif().format(0, "minute");
  if (minutes < 60) return relatif().format(-minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (hours < 24) return relatif().format(-hours, "hour");

  const days = Math.round(hours / 24);
  if (days < 31) return relatif().format(-days, "day");

  return formatDateTime(iso).split(" ")[0] ?? "";
}

/** Une note de produit : « 4,5 » en français, « 4.5 » en anglais. */
export function formatRating(value: number): string {
  return new Intl.NumberFormat(BCP47[langue], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Initiales pour l'avatar par défaut. */
export function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Drapeau émoji à partir d'un code pays ISO 3166-1 alpha-2. */
export function flagEmoji(countryCode: string): string {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return "🏳️";
  return countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

/** Montant signé lisible : "+100" / "−100". */
export function formatSignedUno(amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${new Intl.NumberFormat(BCP47[langue]).format(Math.abs(amount))}`;
}
