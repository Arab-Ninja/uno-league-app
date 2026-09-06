/**
 * Machines à états du domaine (CDC §19).
 *
 * Une transition n'est légale que si elle figure dans les tables ci-dessous.
 * Le serveur vérifie systématiquement l'état courant lu en base avant
 * d'appliquer une transition (STATE-001).
 */

export const PROPOSAL_STATUSES = [
  "proposal",
  "reservation",
  "session",
  "completed",
  "cancelled",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "initiated",
  "paid",
  "failed",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "finished",
  "validated",
  "corrected",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const ANNOUNCEMENT_STATUSES = [
  "draft",
  "published",
  "expired",
  "archived",
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const USER_STATUSES = [
  "active",
  "suspended",
  "deleted",
  "anonymized",
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

type TransitionMap<T extends string> = Readonly<Record<T, readonly T[]>>;

export const PROPOSAL_TRANSITIONS: TransitionMap<ProposalStatus> = {
  proposal: ["reservation", "cancelled"],
  reservation: ["session", "proposal", "cancelled"],
  session: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  pending: ["initiated", "paid", "failed"],
  initiated: ["paid", "failed"],
  paid: ["refunded"],
  failed: ["initiated"],
  refunded: [],
};

export const ORDER_TRANSITIONS: TransitionMap<OrderStatus> = {
  pending: ["paid", "cancelled"],
  paid: ["fulfilled", "refunded"],
  fulfilled: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const MATCH_TRANSITIONS: TransitionMap<MatchStatus> = {
  scheduled: ["live", "finished"],
  live: ["finished"],
  finished: ["validated"],
  validated: ["corrected"],
  corrected: ["validated"],
};

export const ANNOUNCEMENT_TRANSITIONS: TransitionMap<AnnouncementStatus> = {
  draft: ["published", "archived"],
  published: ["expired", "archived"],
  expired: ["archived"],
  archived: [],
};

export const USER_TRANSITIONS: TransitionMap<UserStatus> = {
  active: ["suspended", "deleted", "anonymized"],
  suspended: ["active", "deleted", "anonymized"],
  deleted: ["anonymized"],
  anonymized: [],
};

export function canTransition<T extends string>(
  map: TransitionMap<T>,
  from: T,
  to: T,
): boolean {
  const allowed = map[from];
  return Array.isArray(allowed) && (allowed as readonly string[]).includes(to);
}

/**
 * Statuts pour lesquels un joueur peut encore rejoindre une proposition
 * (CAL-006 : uniquement tant qu'elle est ouverte).
 */
export function isJoinable(status: ProposalStatus): boolean {
  return status === "proposal";
}

/** Une proposition est « active » tant qu'elle n'est ni jouée ni annulée. */
export function isActiveProposal(status: ProposalStatus): boolean {
  return (
    status === "proposal" || status === "reservation" || status === "session"
  );
}
