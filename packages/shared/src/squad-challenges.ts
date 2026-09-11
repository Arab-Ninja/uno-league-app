import { SQUAD_LIMITS, SQUAD_MATCH_DURATIONS } from "./constants.js";

/**
 * Règles de négociation d'un défi (SQUAD-004).
 *
 * Elles vivent ici, pures et testables, plutôt que dans le service : l'écran
 * doit annoncer la même chose que le serveur applique — combien de tours il
 * reste, quel montant minimum proposer — et deux implémentations auraient
 * fini par se contredire.
 */

export type SquadChallengeStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired"
  | "completed";

/** Un défi tranché ne se négocie plus, et son chat passe en lecture seule. */
export function isChallengeSettled(status: SquadChallengeStatus): boolean {
  return status !== "pending";
}

/**
 * Nombre de contre-offres déjà faites.
 *
 * Le tour 1 est l'offre d'ouverture, qui n'est pas une contre-offre : le
 * défiant propose, il ne répond à personne.
 */
export function counterOffersMade(negotiationRound: number): number {
  return Math.max(0, negotiationRound - 1);
}

/** Contre-offres encore possibles avant d'avoir à trancher. */
export function counterOffersLeft(negotiationRound: number): number {
  return Math.max(
    0,
    SQUAD_LIMITS.negotiationRounds - counterOffersMade(negotiationRound),
  );
}

export function mayCounterOffer(negotiationRound: number): boolean {
  return counterOffersLeft(negotiationRound) > 0;
}

/**
 * Montant minimum d'une contre-offre.
 *
 * **Une contre-offre monte, elle ne descend jamais.** La spécification le dit,
 * et la règle a une raison : autoriser la baisse ferait du marchandage une
 * partie à somme nulle où le club le plus patient gagne, alors que la mise
 * est censée mesurer la confiance qu'on a dans son équipe. Monter engage.
 */
export function minimumCounterStake(currentStake: number): number {
  return currentStake + 1;
}

export function isAllowedDuration(minutes: number): boolean {
  return (SQUAD_MATCH_DURATIONS as readonly number[]).includes(minutes);
}

/**
 * Un défi expire s'il n'a pas été tranché à temps (SQUAD-004).
 *
 * Sans échéance, une équipe garderait indéfiniment un défi en suspens et
 * bloquerait un créneau que personne n'ose plus proposer. L'expiration se
 * calcule à la création et ne bouge plus : une contre-offre ne la repousse
 * pas, sans quoi le marchandage servirait à gagner du temps.
 */
export function challengeExpiry(createdAt: Date): Date {
  return new Date(
    createdAt.getTime() + SQUAD_LIMITS.challengeExpiryHours * 60 * 60 * 1000,
  );
}

export function isChallengeExpired(
  status: SquadChallengeStatus,
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  return status === "pending" && expiresAt.getTime() <= now.getTime();
}
