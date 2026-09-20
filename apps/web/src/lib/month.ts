import { formatMonth, formatWeekdayNarrow } from "@/lib/format.js";

/**
 * La grille d'un mois, du lundi au dimanche.
 *
 * Extraite du calendrier des sessions le jour où celui des tournois en a eu
 * besoin (TOUR-006). Deux copies auraient fini par diverger — et une grille
 * qui diverge, c'est un calendrier qui commence le lundi et l'autre le
 * dimanche, dans la même application.
 */

/** Initiales des jours, dans l'ordre de la grille. */
/**
 * Les initiales des sept jours, du lundi au dimanche, dans la langue active.
 *
 * Tirées d'`Intl` plutôt qu'écrites en dur : « L M M J V S D » devient
 * « M T W T F S S » en anglais et « M D W D V Z Z » en néerlandais, et
 * personne n'a à tenir trois listes à jour. Le 4 janvier 2027 est un lundi,
 * ce qui donne le point de départ de la semaine.
 */
export function weekdayInitials(): string[] {
  const jours: string[] = [];
  for (let i = 0; i < 7; i++) {
    const jour = new Date(Date.UTC(2027, 0, 4 + i));
    jours.push(formatWeekdayNarrow(jour).toUpperCase());
  }
  return jours;
}

/**
 * Les cases du mois : une date ISO par jour, `null` pour les cases de
 * remplissage avant le premier et après le dernier.
 */
export function monthMatrix(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay : 0 = dimanche. On décale pour commencer le lundi.
  const leading = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Premier et dernier jour du mois, en dates ISO — les bornes d'une requête. */
export function monthRange(
  year: number,
  month: number,
): { from: string; to: string } {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { from: `${prefix}-01`, to: `${prefix}-${lastDay}` };
}

/** « septembre 2026 », tel qu'il s'écrit en tête du calendrier. */
export function monthLabel(year: number, month: number): string {
  return formatMonth(year, month);
}
