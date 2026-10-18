import { DEFAULT_TIMEZONE } from "./constants.js";
import { utcToZonedParts } from "./time.js";

/**
 * Ce qu'un joueur reçoit, et par où (NOTIF-001).
 *
 * Chaque notification appartient à une catégorie. Elle est **toujours**
 * enregistrée dans l'onglet « Pour moi » : c'est l'historique, et il ne se
 * règle pas. Ce que le joueur règle, catégorie par catégorie, ce sont les
 * deux canaux qui viennent le chercher hors de l'application — le push sur
 * son téléphone, et l'e-mail quand le push n'a atteint aucun appareil.
 *
 * **Deux catégories ne se coupent pas** : ses séances et ses paiements. Un
 * joueur qui découvre l'application pourrait les couper par erreur, puis
 * rater une annulation ou perdre sa place faute d'avoir vu l'échéance. La
 * désinscription des e-mails, elle, vaut pour tout : c'est un droit, et le
 * push et l'onglet continuent de le prévenir.
 */
export const NOTIFICATION_CATEGORIES = [
  "sessions",
  "payments",
  "reminders",
  "newProposals",
  "joins",
  "wallet",
  "shop",
  "announcements",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationChannel = "push" | "email";

interface CategoryRule {
  /** Toujours active, sur les deux canaux. */
  locked: boolean;
  /** Le push, actif par défaut ou non. */
  push: boolean;
  /** L'e-mail par défaut, ou `null` quand la catégorie n'en envoie jamais. */
  email: boolean | null;
}

/**
 * Les règles de chaque catégorie.
 *
 * Pas d'e-mail pour les annonces, les nouvelles séances ni les arrivées de
 * joueurs : envoyer un courrier à chaque fois, à chaque joueur sans push,
 * serait un envoi de masse. Le rappel de séance en a un, désactivé par
 * défaut — utile à qui n'a pas l'application, superflu pour les autres.
 */
export const NOTIFICATION_RULES: Record<NotificationCategory, CategoryRule> = {
  sessions: { locked: true, push: true, email: true },
  payments: { locked: true, push: true, email: true },
  reminders: { locked: false, push: true, email: false },
  newProposals: { locked: false, push: true, email: null },
  // Un joueur rejoint une séance où l'on est inscrit : utile pour suivre le
  // remplissage, trop fréquent pour mériter un e-mail.
  joins: { locked: false, push: true, email: null },
  wallet: { locked: false, push: true, email: true },
  shop: { locked: false, push: true, email: true },
  announcements: { locked: false, push: true, email: null },
};

/** Les heures calmes, à l'heure de Bruxelles : pas de push de 22 h à 8 h. */
export const QUIET_HOURS = { start: 22, end: 8 } as const;

/** Combien d'heures avant le coup d'envoi part le rappel, au choix du joueur. */
export const REMINDER_HOURS_CHOICES = [1, 2, 3, 4, 6, 12, 24] as const;
export const DEFAULT_REMINDER_HOURS = 4;

/**
 * Une séance est « presque complète » à quatre places sur cinq prises : ses
 * inscrits sont prévenus, pour appeler les derniers joueurs.
 */
export const ALMOST_FULL_RATIO = 0.8;

export interface NotificationSettings {
  push: Record<NotificationCategory, boolean>;
  email: Record<NotificationCategory, boolean>;
  quietHours: boolean;
  reminderHours: number;
}

/** Ce qui est enregistré : seulement ce que le joueur a changé. */
export interface StoredNotificationSettings {
  push?: Partial<Record<NotificationCategory, boolean>>;
  email?: Partial<Record<NotificationCategory, boolean>>;
  quietHours?: boolean;
  reminderHours?: number;
}

/**
 * Les réglages effectifs d'un joueur : ce qu'il a choisi, complété par les
 * défauts. Une catégorie verrouillée reste active quoi qu'il soit enregistré,
 * et une catégorie sans e-mail n'en envoie jamais.
 */
export function resolveNotificationSettings(
  stored: StoredNotificationSettings | null | undefined,
): NotificationSettings {
  const push = {} as Record<NotificationCategory, boolean>;
  const email = {} as Record<NotificationCategory, boolean>;
  for (const category of NOTIFICATION_CATEGORIES) {
    const rule = NOTIFICATION_RULES[category];
    push[category] = rule.locked
      ? true
      : (stored?.push?.[category] ?? rule.push);
    email[category] =
      rule.email === null
        ? false
        : rule.locked
          ? true
          : (stored?.email?.[category] ?? rule.email);
  }

  const hours = stored?.reminderHours;
  return {
    push,
    email,
    quietHours: stored?.quietHours ?? true,
    reminderHours:
      hours !== undefined &&
      (REMINDER_HOURS_CHOICES as readonly number[]).includes(hours)
        ? hours
        : DEFAULT_REMINDER_HOURS,
  };
}

/** Cet instant tombe-t-il dans les heures calmes, à l'heure de la ligue ? */
export function isQuietHour(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const { hour } = utcToZonedParts(instant, timeZone);
  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
}
