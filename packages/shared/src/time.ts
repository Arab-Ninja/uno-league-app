/**
 * Utilitaires de temps (TECH-002).
 *
 * Règle : toute date persistée est en UTC. Un créneau de match désigne une
 * heure murale locale au lieu de jeu ; la conversion vers UTC tient compte
 * des changements d'heure (DST).
 *
 * Implémenté sans dépendance externe via `Intl`, afin que la même logique
 * tourne à l'identique côté serveur Node et côté navigateur.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Décalage, en millisecondes, du fuseau par rapport à UTC à cet instant. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Convertit une heure murale locale (fuseau du lieu) en instant UTC.
 * Deux passes pour rester correct aux frontières de changement d'heure.
 */
export function zonedTimeToUtc(
  isoDate: string,
  hour: number,
  timeZone: string,
  minute = 0,
): Date {
  if (!ISO_DATE_RE.test(isoDate)) {
    throw new Error(`Date ISO attendue (YYYY-MM-DD), reçu : ${isoDate}`);
  }
  const [year, month, day] = isoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = timeZoneOffsetMs(new Date(naive), timeZone);
  let timestamp = naive - firstOffset;
  const secondOffset = timeZoneOffsetMs(new Date(timestamp), timeZone);
  if (secondOffset !== firstOffset) {
    timestamp = naive - secondOffset;
  }
  return new Date(timestamp);
}

/** Décompose un instant UTC en composantes murales dans un fuseau donné. */
export function utcToZonedParts(
  instant: Date,
  timeZone: string,
): { isoDate: string; hour: number; minute: number } {
  const offset = timeZoneOffsetMs(instant, timeZone);
  const shifted = new Date(instant.getTime() + offset);
  return {
    isoDate: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Date du jour au format YYYY-MM-DD dans le fuseau demandé. */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  return utcToZonedParts(now, timeZone).isoDate;
}

/** Ajoute `days` jours calendaires à une date ISO (YYYY-MM-DD). */
export function addDaysIso(isoDate: string, days: number): string {
  if (!ISO_DATE_RE.test(isoDate)) {
    throw new Error(`Date ISO attendue (YYYY-MM-DD), reçu : ${isoDate}`);
  }
  const [year, month, day] = isoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Différence en jours calendaires entre deux dates ISO (b - a). */
export function diffDaysIso(a: string, b: string): number {
  const toUtc = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Libellé "HH:MM" à partir d'un nombre d'heures (24 devient 00:00). */
export function hourLabel(hour: number, minute = 0): string {
  const h = ((hour % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
