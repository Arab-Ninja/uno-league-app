/**
 * La grille d'un mois, du lundi au dimanche.
 *
 * Extraite du calendrier des sessions le jour où celui des tournois en a eu
 * besoin (TOUR-006). Deux copies auraient fini par diverger — et une grille
 * qui diverge, c'est un calendrier qui commence le lundi et l'autre le
 * dimanche, dans la même application.
 */

/** Initiales des jours, dans l'ordre de la grille. */
export const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;

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
  return new Intl.DateTimeFormat("fr-BE", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month, 1)));
}
