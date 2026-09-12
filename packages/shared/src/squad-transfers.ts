import { SQUAD_LIMITS } from "./constants.js";

/**
 * Règles du marché des transferts (SQUAD-008).
 *
 * Pures et testables, comme celles des défis : l'écran doit annoncer
 * exactement ce que le serveur appliquera — combien de tours il reste, à qui
 * la balle, quand la carence expire. Deux implémentations auraient fini par se
 * contredire, et c'est de l'argent.
 *
 * **Un transfert se conclut à trois.** Le club vendeur cède, le club acheteur
 * paie, et le joueur accepte de partir. Aucun des trois ne peut être passé :
 * un club qui vendrait un joueur contre son gré en ferait une marchandise, et
 * un joueur qui partirait sans l'accord de son club viderait la notion de
 * contrat. C'est la différence de fond avec un défi, qui se conclut à deux.
 */

export type SquadTransferStatus =
  | "pending"
  | "awaiting_player"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired";

/** À qui revient la décision, à cet instant du dossier. */
export type SquadTransferTurn = "selling" | "player" | "none";

/** Un transfert tranché ne se négocie plus. */
export function isTransferSettled(status: SquadTransferStatus): boolean {
  return status !== "pending" && status !== "awaiting_player";
}

/**
 * Vrai tant que l'argent de l'acheteur est immobilisé.
 *
 * La mise en séquestre a lieu quand le club vendeur accepte : à partir de là,
 * le joueur dispose d'un délai pour trancher, et l'offre qu'on lui fait doit
 * être couverte pendant tout ce délai. Avant, rien n'est bloqué — sans quoi
 * une simple offre suffirait à geler la caisse d'un rival.
 */
export function isTransferEscrowed(status: SquadTransferStatus): boolean {
  return status === "awaiting_player";
}

/** Le tour de parole que le statut implique. */
export function transferTurn(status: SquadTransferStatus): SquadTransferTurn {
  if (status === "pending") return "selling";
  if (status === "awaiting_player") return "player";
  return "none";
}

/** Contre-offres déjà faites : le tour 1 est l'offre d'ouverture. */
export function transferCounterOffersMade(negotiationRound: number): number {
  return Math.max(0, negotiationRound - 1);
}

export function transferCounterOffersLeft(negotiationRound: number): number {
  return Math.max(
    0,
    SQUAD_LIMITS.negotiationRounds - transferCounterOffersMade(negotiationRound),
  );
}

export function mayCounterTransfer(negotiationRound: number): boolean {
  return transferCounterOffersLeft(negotiationRound) > 0;
}

/**
 * Coût total d'une offre pour le club acheteur.
 *
 * L'indemnité va au club vendeur, la prime au joueur : deux destinataires,
 * une seule sortie de caisse. Les additionner en un seul endroit évite qu'un
 * contrôle de solde n'en oublie une moitié.
 */
export function transferTotalCost(
  feeUno: number,
  signingBonusUno: number,
): number {
  return feeUno + signingBonusUno;
}

/**
 * Une contre-offre du club vendeur monte l'indemnité.
 *
 * Même principe que la mise d'un défi : le marchandage ne va que dans un
 * sens, sinon il n'a pas de raison de s'arrêter. Le vendeur réclame plus,
 * l'acheteur suit ou renonce. La prime au joueur n'est pas contrainte : elle
 * ne sort pas de la même poche que celle du vendeur, et il n'a aucune raison
 * de la faire monter pour lui-même.
 */
export function minimumCounterFee(currentFeeUno: number): number {
  return currentFeeUno + 1;
}

/** Fin du délai laissé au club vendeur, puis au joueur, pour répondre. */
export function transferExpiry(from: Date): Date {
  return new Date(
    from.getTime() + SQUAD_LIMITS.challengeExpiryHours * 60 * 60 * 1000,
  );
}

export function isTransferExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Fin de la carence qui suit un transfert abouti (SQUAD-008).
 *
 * Sans elle, un joueur pourrait faire le tour des clubs en une soirée, et
 * chaque club vendeur encaisserait une indemnité au passage : de quoi
 * fabriquer des UNO à partir de rien.
 */
export function transferCooldownEnd(completedAt: Date): Date {
  return new Date(
    completedAt.getTime() +
      SQUAD_LIMITS.transferCooldownDays * 24 * 60 * 60 * 1000,
  );
}

export function isInTransferCooldown(
  lastCompletedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (lastCompletedAt === null) return false;
  return transferCooldownEnd(lastCompletedAt).getTime() > now.getTime();
}

/** Jours entiers restants avant la fin de la carence, 0 si elle est finie. */
export function transferCooldownDaysLeft(
  lastCompletedAt: Date | null,
  now: Date = new Date(),
): number {
  if (lastCompletedAt === null) return 0;
  const remaining = transferCooldownEnd(lastCompletedAt).getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}
