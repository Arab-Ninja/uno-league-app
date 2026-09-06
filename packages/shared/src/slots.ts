import {
  SLOT_DAY_END_HOUR,
  SLOT_DAY_START_HOUR,
  type GameMode,
} from "./constants.js";
import { hourLabel } from "./time.js";

/**
 * Génération des créneaux horaires (CAL-004).
 *
 * Les créneaux courent de 14:00 à 00:00, par pas égal à la durée du mode.
 * Aucun créneau ne dépasse minuit ni ne chevauche un autre créneau du même
 * lieu : les créneaux d'un même mode forment une partition régulière.
 *
 *   Match amical (1 h) : 14-15, 15-16, ... 23-00  (10 créneaux)
 *   UNO League   (2 h) : 14-16, 16-18, 18-20, 20-22, 22-00  (5 créneaux)
 */

export interface TimeSlot {
  /** Identifiant stable du créneau au sein d'une journée, ex. "18". */
  id: string;
  startHour: number;
  endHour: number;
  /** Libellé affiché, ex. "18:00 - 20:00". */
  label: string;
}

export function generateSlots(mode: GameMode): TimeSlot[] {
  const duration = mode.durationHours;
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new Error(`Durée de mode invalide : ${duration}`);
  }

  const slots: TimeSlot[] = [];
  for (
    let start = SLOT_DAY_START_HOUR;
    start + duration <= SLOT_DAY_END_HOUR;
    start += duration
  ) {
    const end = start + duration;
    slots.push({
      id: String(start),
      startHour: start,
      endHour: end,
      label: `${hourLabel(start)} - ${hourLabel(end)}`,
    });
  }
  return slots;
}

/** Retrouve un créneau à partir de son heure de début, pour un mode donné. */
export function findSlot(mode: GameMode, startHour: number): TimeSlot | undefined {
  return generateSlots(mode).find((slot) => slot.startHour === startHour);
}

/** Vrai si `startHour` est une heure de début valide pour ce mode. */
export function isValidSlotStart(mode: GameMode, startHour: number): boolean {
  return findSlot(mode, startHour) !== undefined;
}
