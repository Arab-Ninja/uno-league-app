import { UNO_PER_EUR, formatEur, formatUno } from "@uno/shared";

/** Formatage d'affichage. Aucune règle métier n'est décidée ici (P-004). */

const LOCALE = "fr-BE";

export { formatEur, formatUno, UNO_PER_EUR };

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "lundi 8 septembre" à partir d'une date ISO (YYYY-MM-DD). */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return dateFormatter.format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return shortDateFormatter.format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** "il y a 3 jours", "à l'instant". */
export function formatRelative(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(deltaMs / 60_000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.round(hours / 24);
  if (days < 31) return `il y a ${days} j`;

  return formatDateTime(iso).split(" ")[0] ?? "";
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
  return `${sign}${new Intl.NumberFormat(LOCALE).format(Math.abs(amount))}`;
}
