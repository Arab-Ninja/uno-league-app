import { LIMITS } from "./constants.js";

/**
 * Politique de mot de passe (AUTH-002) : 8 caractères minimum, au moins une
 * majuscule et au moins un chiffre. Validée identiquement côté client (pour
 * le retour immédiat) et côté serveur (source de vérité, SEC-003).
 */

export interface PasswordCheck {
  valid: boolean;
  issues: string[];
}

export function checkPassword(password: string): PasswordCheck {
  const issues: string[] = [];

  if (password.length < LIMITS.passwordMin) {
    issues.push(`Au moins ${LIMITS.passwordMin} caractères`);
  }
  if (password.length > LIMITS.passwordMax) {
    issues.push(`Au maximum ${LIMITS.passwordMax} caractères`);
  }
  if (!/[A-ZÀ-Þ]/.test(password)) {
    issues.push("Au moins une majuscule");
  }
  if (!/\d/.test(password)) {
    issues.push("Au moins un chiffre");
  }

  return { valid: issues.length === 0, issues };
}

export function isValidPassword(password: string): boolean {
  return checkPassword(password).valid;
}

/** Normalisation d'email : trim + minuscules (AUTH-003). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
