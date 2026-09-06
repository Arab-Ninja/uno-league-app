import { UNO_PER_EUR } from "./constants.js";

/**
 * Conversions monétaires UNO / EUR (INFO-001, HOME-002, CAL-009).
 * Les UNO sont toujours des entiers non négatifs (DATA-002).
 */

/** Convertit un prix en euros vers son coût en points UNO. */
export function eurToUno(eur: number): number {
  return Math.round(eur * UNO_PER_EUR);
}

/** Valeur en euros d'un solde UNO, arrondie au centime. */
export function unoToEur(uno: number): number {
  return Math.round((uno / UNO_PER_EUR) * 100) / 100;
}

/** Formate un solde UNO en euros, ex. 1000 -> "100,00 €" (HOME-002). */
export function formatEur(uno: number, locale = "fr-BE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(unoToEur(uno));
}

/** Formate un montant UNO, ex. 1000 -> "1 000 UNO". */
export function formatUno(uno: number, locale = "fr-BE"): string {
  return `${new Intl.NumberFormat(locale).format(uno)} UNO`;
}

/** Un montant UNO valide est un entier fini strictement positif. */
export function isValidUnoAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Un solde UNO valide est un entier fini non négatif. */
export function isValidUnoBalance(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
