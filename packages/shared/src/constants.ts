/**
 * Source de vérité unique du domaine UNO League (exigence INFO-001).
 *
 * Toute valeur métier affichée dans l'application — ratio UNO/EUR, prix,
 * quotas, récompenses — DOIT provenir de ce fichier. Aucun écran ne doit
 * redéclarer une constante métier localement.
 */

/** Ratio officiel : 10 UNO = 1 EUR (CDC §11). */
export const UNO_PER_EUR = 10;

/** Solde offert à la création du compte (AUTH-001). */
export const SIGNUP_BONUS_UNO = 1000;

/** Division attribuée à l'inscription (AUTH-001). */
export const SIGNUP_DIVISION = "D3";

/** Niveau de départ (AUTH-001). */
export const SIGNUP_LEVEL = 1;

/** Délai minimum entre aujourd'hui et la date d'une proposition (CAL-003). */
export const MIN_PROPOSAL_LEAD_DAYS = 2;

/** Première heure de créneau, en heure locale du lieu (CAL-004). */
export const SLOT_DAY_START_HOUR = 14;

/** Dernière heure de fin de créneau : minuit (CAL-004). */
export const SLOT_DAY_END_HOUR = 24;

/** Nombre de joueurs par équipe pour le MVP (MATCH-001). */
export const TEAM_SIZE = 5;

/** Format officiel d'un match de futsal (MATCH-002). */
export const MATCH_FORMAT = {
  playersPerTeam: 5,
  periods: 2,
  periodMinutes: 20,
} as const;

/** Nombre de transactions affichées par défaut dans le wallet (WAL-004). */
export const WALLET_RECENT_TRANSACTIONS = 10;

/** Nombre de sessions à venir affichées sur le dashboard (HOME-001). */
export const HOME_UPCOMING_SESSIONS = 3;

/** Nombre d'annonces affichées sur le dashboard (CDC §7). */
export const HOME_ANNOUNCEMENTS = 3;

/** Fuseau par défaut des lieux de jeu (TECH-002). */
export const DEFAULT_TIMEZONE = "Europe/Brussels";

// ---------------------------------------------------------------------------
// Divisions
// ---------------------------------------------------------------------------

export const DIVISIONS = ["D1", "D2", "D3"] as const;
export type Division = (typeof DIVISIONS)[number];

export const DIVISION_LABELS: Record<Division, string> = {
  D1: "Division 1",
  D2: "Division 2",
  D3: "Division 3",
};

/**
 * Divisions voisines (RANK-005).
 *
 * `null` marque une extrémité : personne ne monte au-dessus de la D1 ni ne
 * descend en dessous de la D3. Les appelants n'ont donc pas à connaître
 * l'ordre des divisions, ce qui évite qu'un oubli fasse « monter » un joueur
 * déjà au sommet.
 */
export function divisionAbove(division: Division): Division | null {
  return division === "D3" ? "D2" : division === "D2" ? "D1" : null;
}

export function divisionBelow(division: Division): Division | null {
  return division === "D1" ? "D2" : division === "D2" ? "D3" : null;
}

/**
 * Nombre de joueurs qui montent — et autant qui descendent — à l'issue d'une
 * session UNO League. Une session réunit trois équipes de cinq : le tiers de
 * tête monte, le tiers de queue descend, le tiers médian se maintient.
 */
export const SESSION_MOVEMENT_COUNT = 5;

// ---------------------------------------------------------------------------
// Types de compte (ROLE-003)
// ---------------------------------------------------------------------------

/**
 * Un compte est ouvert soit comme joueur, soit comme arbitre — choix fait à
 * l'inscription, modifiable ensuite par l'administration seule.
 *
 * Les deux rôles n'ont presque rien en commun : l'arbitre ne joue pas, ne
 * paie pas sa place, n'a ni statistiques ni division, n'apparaît pas au
 * classement, et se déclare sur une session UNO League au lieu de s'y
 * inscrire. Les confondre dans un même compte obligerait chaque écran à
 * demander « en quelle qualité ? » à chaque fois.
 */
export const ACCOUNT_TYPES = ["player", "referee"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  player: "Joueur",
  referee: "Arbitre",
};

export const ACCOUNT_TYPE_DESCRIPTIONS: Record<AccountType, string> = {
  player:
    "Vous participez aux sessions, payez votre place et apparaissez au classement de votre division.",
  referee:
    "Vous arbitrez les sessions UNO League. Vous ne payez pas votre place et êtes rémunéré en UNO pour chaque session arbitrée.",
};

/** Rémunération d'un arbitre pour une session UNO League arbitrée (§8.2). */
export const REFEREE_SESSION_FEE_UNO = 150;

export type DivisionMovement = "promoted" | "relegated" | "stayed";

export const MOVEMENT_LABELS: Record<DivisionMovement, string> = {
  promoted: "Monte",
  relegated: "Descend",
  stayed: "Se maintient",
};

// ---------------------------------------------------------------------------
// Modes de jeu (CDC §8 et §13)
// ---------------------------------------------------------------------------

export type GameModeId =
  | "friendly"
  | "league"
  | "minigames"
  | "training"
  | "tournaments";

export interface GameMode {
  id: GameModeId;
  name: string;
  shortDescription: string;
  /** Un mode non planifiable est visible mais marqué « Bientôt disponible » (MODE-001). */
  schedulable: boolean;
  /** Nombre de participants requis pour fermer la proposition (CAL-007). */
  minParticipants: number;
  /** Durée d'un créneau, en heures (CAL-004). */
  durationHours: number;
  /** Prix de participation en euros (CDC §8). */
  priceEur: number;
  /** true : la proposition est restreinte à la division du joueur (CAL-002). */
  divisionLocked: boolean;
  /** true : les statistiques comptent pour le classement (CDC §8). */
  ranked: boolean;
  /** Nombre d'équipes formées à partir des participants (MATCH-001). */
  teamCount: number;
}

export const GAME_MODES: readonly GameMode[] = [
  {
    id: "league",
    name: "UNO League",
    shortDescription: "Compétition officielle par division, classée.",
    schedulable: true,
    minParticipants: 15,
    durationHours: 2,
    priceEur: 20,
    divisionLocked: true,
    ranked: true,
    teamCount: 3,
  },
  {
    id: "friendly",
    name: "Match amical",
    shortDescription: "Sessions ouvertes à toutes les divisions, non classées.",
    schedulable: true,
    minParticipants: 10,
    durationHours: 1,
    priceEur: 10,
    divisionLocked: false,
    ranked: false,
    teamCount: 2,
  },
  {
    id: "minigames",
    name: "Mini-jeux",
    shortDescription: "Défis courts et ateliers techniques entre joueurs.",
    schedulable: false,
    minParticipants: 0,
    durationHours: 1,
    priceEur: 0,
    divisionLocked: false,
    ranked: false,
    teamCount: 0,
  },
  {
    id: "training",
    name: "Entraînements",
    shortDescription: "Séances encadrées pour progresser hors compétition.",
    schedulable: false,
    minParticipants: 0,
    durationHours: 1,
    priceEur: 0,
    divisionLocked: false,
    ranked: false,
    teamCount: 0,
  },
  {
    id: "tournaments",
    name: "Tournois",
    shortDescription: "Formats à élimination avec récompenses majorées.",
    schedulable: false,
    minParticipants: 0,
    durationHours: 1,
    priceEur: 0,
    divisionLocked: false,
    ranked: false,
    teamCount: 0,
  },
] as const;

export const SCHEDULABLE_MODE_IDS = ["friendly", "league"] as const;
export type SchedulableModeId = (typeof SCHEDULABLE_MODE_IDS)[number];

export function getGameMode(id: string): GameMode | undefined {
  return GAME_MODES.find((m) => m.id === id);
}

export function isSchedulableMode(id: string): id is SchedulableModeId {
  return (SCHEDULABLE_MODE_IDS as readonly string[]).includes(id);
}

/** Le mode doit exister ET être planifiable, sinon on lève une erreur. */
export function requireSchedulableMode(id: string): GameMode {
  const mode = getGameMode(id);
  if (!mode || !mode.schedulable) {
    throw new Error(`Mode de jeu non planifiable : ${id}`);
  }
  return mode;
}

// ---------------------------------------------------------------------------
// Lieux (CDC §8)
// ---------------------------------------------------------------------------

export interface Venue {
  id: string;
  name: string;
  timezone: string;
}

export const VENUES: readonly Venue[] = [
  { id: "fit-five-forest", name: "Fit Five Forest", timezone: DEFAULT_TIMEZONE },
  { id: "yc-five", name: "YC Five", timezone: DEFAULT_TIMEZONE },
  { id: "city-five", name: "City Five", timezone: DEFAULT_TIMEZONE },
  { id: "arena", name: "Arena", timezone: DEFAULT_TIMEZONE },
] as const;

export function getVenue(id: string): Venue | undefined {
  return VENUES.find((v) => v.id === id);
}

// ---------------------------------------------------------------------------
// Politique de récompenses (CDC §8.2)
// ---------------------------------------------------------------------------

export type RewardKind =
  | "topScorer"
  | "topAssist"
  | "topDefender"
  | "bestTeam"
  | "participation";

export const REWARD_KIND_LABELS: Record<RewardKind, string> = {
  topScorer: "Meilleur buteur",
  topAssist: "Meilleur passeur",
  topDefender: "Meilleur défenseur",
  bestTeam: "Meilleure équipe",
  participation: "Participation",
};

/**
 * Barème officiel du règlement, utilisé lorsqu'aucune campagne de récompense
 * n'est paramétrée en base pour la saison en cours (CDC §8.2).
 *
 * La version est incrémentée à chaque changement de barème afin que les
 * attributions passées restent traçables.
 */
export const REWARD_POLICY_VERSION = 1;

export const DEFAULT_REWARD_POLICY: Record<
  RewardKind,
  Record<Division, number>
> = {
  topScorer: { D1: 250, D2: 200, D3: 150 },
  topAssist: { D1: 150, D2: 100, D3: 75 },
  topDefender: { D1: 150, D2: 100, D3: 75 },
  bestTeam: { D1: 20, D2: 20, D3: 20 },
  participation: { D1: 10, D2: 10, D3: 10 },
};

export function rewardAmount(kind: RewardKind, division: Division): number {
  return DEFAULT_REWARD_POLICY[kind][division];
}

// ---------------------------------------------------------------------------
// Progression XP / niveau
// ---------------------------------------------------------------------------

/**
 * Le cahier des charges impose `level >= 1` et `xp >= 0` sans définir la
 * courbe de progression. Ce barème versionné tient lieu de règle officielle
 * tant qu'aucune campagne saisonnière ne le remplace.
 */
/**
 * Progression par l'expérience (XP-002).
 *
 * **Ce qui change, et pourquoi.** Chaque palier coûtait 500 XP, quel qu'il
 * soit : la progression était linéaire, donc un joueur régulier accumulait
 * des niveaux indéfiniment au même rythme. Un niveau élevé ne disait plus
 * rien d'autre que « il est là depuis longtemps ».
 *
 * Un palier coûte désormais `XP_LEVEL_BASE + XP_LEVEL_STEP × (niveau − 1)` :
 * 300 XP pour passer niveau 2, 400 pour le 3, 500 pour le 4, et ainsi de
 * suite. Les premiers niveaux viennent vite — c'est ce qui donne envie de
 * continuer — et les suivants se méritent.
 *
 * **Le calibrage est celui de la ligue**, pas une valeur ronde prise au
 * hasard. Une séance rapporte 50 XP de participation plus ses actions ; un
 * joueur correct en tire 120 à 180. Avec une séance par semaine :
 *
 *   niveau 2  →  ~2 séances        niveau 5  →  ~12 séances
 *   niveau 10 →  ~42 séances (≈ 1 an)
 *   niveau 15 →  ~89 séances (≈ 2 ans)
 *   niveau 20 →  ~152 séances (≈ 3 ans et demi)
 */
export const XP_POLICY_VERSION = 2;

/** Coût du premier palier, et surcoût de chacun des suivants. */
export const XP_LEVEL_BASE = 300;
export const XP_LEVEL_STEP = 100;

/**
 * Ce que rapporte chaque geste.
 *
 * Les distinctions y figurent désormais : un meilleur buteur ou un meilleur
 * passeur a fait quelque chose que la seule somme de ses actions ne dit pas —
 * il a été le meilleur de sa séance. Les montants restent inférieurs à celui
 * d'homme du match, qui couronne l'ensemble.
 */
export const XP_AWARDS = {
  sessionPlayed: 50,
  goal: 20,
  assist: 10,
  defense: 5,
  save: 5,
  motm: 100,
  topScorer: 60,
  topAssist: 50,
  topDefender: 50,
  bestTeam: 25,
} as const;

/**
 * XP cumulée nécessaire pour atteindre un niveau.
 *
 *   total(n) = XP_LEVEL_BASE × (n − 1) + XP_LEVEL_STEP × (n − 1)(n − 2) / 2
 */
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= SIGNUP_LEVEL) return 0;
  const steps = level - 1;
  return XP_LEVEL_BASE * steps + (XP_LEVEL_STEP * steps * (steps - 1)) / 2;
}

/**
 * Niveau atteint avec une XP donnée — la réciproque de `xpForLevel`.
 *
 * Résoudre l'équation du second degré plutôt que boucler garde la fonction
 * en temps constant, ce qui compte : elle est appelée pour chaque joueur de
 * chaque liste affichée.
 */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return SIGNUP_LEVEL;

  const b = XP_LEVEL_BASE - XP_LEVEL_STEP / 2;
  const steps = Math.floor(
    (-b + Math.sqrt(b * b + 2 * XP_LEVEL_STEP * xp)) / XP_LEVEL_STEP,
  );
  return Math.max(SIGNUP_LEVEL, steps + 1);
}

/** Progression (0 → 1) à l'intérieur du niveau courant. */
export function levelProgress(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;

  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  if (span <= 0) return 0;

  return Math.min(1, Math.max(0, (xp - start) / span));
}

/** XP restant à gagner avant le palier suivant. */
export function xpToNextLevel(xp: number): number {
  const current = Number.isFinite(xp) && xp > 0 ? xp : 0;
  return Math.max(0, xpForLevel(levelFromXp(current) + 1) - current);
}

/**
 * UNO versés en atteignant un niveau (XP-003).
 *
 * Dix UNO par palier franchi, cumulatifs : 10 au niveau 2, 20 au niveau 3,
 * 30 au niveau 4. Le montant croît avec le niveau, alors même que les paliers
 * s'espacent — c'est ce qui garde la progression désirable une fois passé
 * l'enthousiasme du début.
 *
 * Le niveau 1 ne rapporte rien : on l'a en s'inscrivant, et le bonus de
 * bienvenue tient déjà ce rôle.
 */
export const UNO_PER_LEVEL_STEP = 10;

export function levelUpReward(level: number): number {
  if (!Number.isFinite(level) || level <= SIGNUP_LEVEL) return 0;
  return (level - 1) * UNO_PER_LEVEL_STEP;
}

// ---------------------------------------------------------------------------
// Boutique (CDC §12)
// ---------------------------------------------------------------------------

export const SHOP_CATEGORIES = [
  "headphones",
  "watches",
  "shoes",
  "clothes",
  "accessories",
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Valeur additionnelle acceptée uniquement comme filtre d'affichage. */
export const SHOP_CATEGORY_FILTERS = ["all", ...SHOP_CATEGORIES] as const;
export type ShopCategoryFilter = (typeof SHOP_CATEGORY_FILTERS)[number];

export const SHOP_CATEGORY_LABELS: Record<ShopCategoryFilter, string> = {
  all: "Tous",
  headphones: "Écouteurs",
  watches: "Montres",
  shoes: "Chaussures",
  clothes: "Vêtements",
  accessories: "Accessoires",
};

// ---------------------------------------------------------------------------
// Statistiques et classement (CDC §10)
// ---------------------------------------------------------------------------

export const RANKING_STATS = [
  "goals",
  "assists",
  "defenses",
  "saves",
  "motm",
] as const;
export type RankingStat = (typeof RANKING_STATS)[number];

export const RANKING_STAT_LABELS: Record<RankingStat, string> = {
  goals: "Buts",
  assists: "Passes",
  defenses: "Défenses",
  saves: "Arrêts",
  motm: "MOTM",
};

/** Abréviations utilisées en en-tête de tableau, façon classement sportif. */
export const RANKING_STAT_SHORT: Record<RankingStat, string> = {
  goals: "B",
  assists: "P",
  defenses: "D",
  saves: "A",
  motm: "M",
};

/**
 * Critères de tri du classement. « points » est le classement général, calculé
 * selon le barème pondéré ; les autres trient sur une statistique brute.
 */
/**
 * Statistiques saisies match par match, donc affichées sur la feuille de
 * match. L'homme du match n'en fait pas partie : il est calculé à l'échelle
 * de la session, pas d'un match.
 */
export const SESSION_STATS = ["goals", "assists", "defenses", "saves"] as const;
export type SessionStat = (typeof SESSION_STATS)[number];

export const RANKING_SORTS = ["points", ...RANKING_STATS] as const;
export type RankingSort = (typeof RANKING_SORTS)[number];

export const RANKING_SORT_LABELS: Record<RankingSort, string> = {
  points: "Général",
  ...RANKING_STAT_LABELS,
};

// ---------------------------------------------------------------------------
// Annonces (CDC §14)
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_TYPES = [
  "info",
  "alert",
  "reward",
  "maintenance",
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
  info: "Information",
  alert: "Alerte",
  reward: "Récompense",
  maintenance: "Maintenance",
};

// ---------------------------------------------------------------------------
// Wallet (CDC §11)
// ---------------------------------------------------------------------------

/** Types visibles par le joueur (WAL-005). */
export const PUBLIC_TRANSACTION_TYPES = [
  "send",
  "receive",
  "purchase",
  "reward",
] as const;

/** Types administratifs internes, explicitement versionnés (WAL-005). */
export const ADMIN_TRANSACTION_TYPES = [
  "admin_credit",
  "admin_debit",
  "signup_bonus",
  "session_fee",
  "refund",
  /**
   * Mouvements liés au mode SQUAD (SQUAD-003).
   *
   * Ils apparaissent dans l'historique personnel du joueur : ce qu'il verse à
   * la caisse de son club sort bien de son portefeuille, et ce qu'il reçoit
   * d'un partage de gains ou d'une prime de signature y entre.
   */
  "squad_contribution",
  "squad_payout",
] as const;

export const TRANSACTION_TYPES = [
  ...PUBLIC_TRANSACTION_TYPES,
  ...ADMIN_TRANSACTION_TYPES,
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  send: "Envoi",
  receive: "Réception",
  purchase: "Achat",
  reward: "Récompense",
  admin_credit: "Crédit administrateur",
  admin_debit: "Débit administrateur",
  signup_bonus: "Bonus de bienvenue",
  session_fee: "Participation session",
  refund: "Remboursement",
  squad_contribution: "Contribution SQUAD",
  squad_payout: "Gains SQUAD",
};

// ---------------------------------------------------------------------------
// Moyens de paiement (CAL-009 / CAL-010)
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  "uno",
  "stripe_card",
  "stripe_bancontact",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  uno: "Points UNO",
  stripe_card: "Carte, Apple Pay, Google Pay",
  stripe_bancontact: "Bancontact",
};

/**
 * Précision affichée sous le moyen de paiement.
 *
 * Apple Pay et Google Pay ne sont pas des moyens de paiement distincts chez
 * Stripe : ce sont des façons de présenter une carte. Stripe Checkout les
 * propose de lui-même sur un appareil compatible dont le domaine a été
 * vérifié — inutile de les lister séparément, et trompeur de le faire sur un
 * appareil qui ne les a pas. Une carte Revolut est une carte : elle passe par
 * le même chemin.
 */
export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  uno: "Débité de votre solde, immédiat.",
  stripe_card:
    "Apple Pay et Google Pay apparaissent automatiquement si votre appareil les propose.",
  stripe_bancontact: "Paiement bancaire belge, via votre application bancaire.",
};

export const EXTERNAL_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (m) => m !== "uno",
) as readonly PaymentMethod[];

// ---------------------------------------------------------------------------
// Limites de validation partagées client/serveur (SEC-003)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tailles des articles (SHOP-002)
// ---------------------------------------------------------------------------

/**
 * Un produit se décline soit sans taille, soit en tailles de vêtement, soit
 * en pointures. C'est l'administration qui tranche à la création : la règle
 * suit le produit, elle n'est pas devinée d'après sa catégorie — un sac
 * rangé dans « vêtements » n'a pas de taille, une chaussette si.
 */
export const SIZE_KINDS = ["none", "clothing", "shoes"] as const;
export type SizeKind = (typeof SIZE_KINDS)[number];

export const SIZE_KIND_LABELS: Record<SizeKind, string> = {
  none: "Taille unique",
  clothing: "Tailles vêtement",
  shoes: "Pointures (EU)",
};

export const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** Pointures européennes, du 36 au 48 : l'amplitude d'un catalogue futsal. */
export const SHOE_SIZES_EU = Array.from({ length: 13 }, (_unused, index) =>
  String(36 + index),
);

export function sizesFor(kind: SizeKind): readonly string[] {
  if (kind === "clothing") return CLOTHING_SIZES;
  if (kind === "shoes") return SHOE_SIZES_EU;
  return [];
}

/** Vrai si l'acheteur doit choisir une taille avant de valider son panier. */
export function requiresSize(kind: SizeKind): boolean {
  return kind !== "none";
}

// ---------------------------------------------------------------------------
// Avis produits (SHOP-002)
// ---------------------------------------------------------------------------

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

// ---------------------------------------------------------------------------
// Délai de paiement d'une réservation (CAL-008)
// ---------------------------------------------------------------------------

/**
 * Une place réservée doit être réglée dans les 24 heures. Passé ce délai, le
 * joueur reçoit un rappel et sa place devient accessible à un remplaçant :
 * une session ne meurt plus d'un seul joueur qui ne paie pas.
 */
export const PAYMENT_DEADLINE_HOURS = 24;

/** Le rappel part quand il reste ce nombre d'heures avant l'échéance. */
export const PAYMENT_REMINDER_HOURS_BEFORE = 4;

// ---------------------------------------------------------------------------
// Évènements notifiés à l'administration (ADMIN-006)
// ---------------------------------------------------------------------------

export const ADMIN_EVENT_TYPES = [
  "proposal.created",
  "proposal.reservation",
  "proposal.session",
  "proposal.completed",
  "proposal.reopened",
  "proposal.cancelled",
  "payment.received",
  "payment.overdue",
  "substitute.registered",
  "substitute.promoted",
  "participant.ineligible",
  "session.video",
  "supervisor.updated",
  "referee.assigned",
  "order.created",
  "order.cancelled",
  "transfer.sent",
  "review.published",
] as const;
export type AdminEventType = (typeof ADMIN_EVENT_TYPES)[number];

export const ADMIN_EVENT_LABELS: Record<AdminEventType, string> = {
  "proposal.created": "Nouvelle proposition",
  "proposal.reservation": "Réservation complète",
  "proposal.session": "Session confirmée",
  "proposal.completed": "Session clôturée",
  "proposal.reopened": "Session rouverte pour correction",
  "proposal.cancelled": "Session annulée",
  "payment.received": "Paiement reçu",
  "payment.overdue": "Paiement en retard",
  "substitute.registered": "Nouveau remplaçant",
  "substitute.promoted": "Remplaçant intégré",
  "participant.ineligible": "Joueur hors division",
  "session.video": "Vidéo de session",
  "supervisor.updated": "Superviseur",
  "referee.assigned": "Arbitre désigné",
  "order.created": "Nouvelle commande",
  "order.cancelled": "Commande annulée",
  "transfer.sent": "Transfert UNO",
  "review.published": "Nouvel avis produit",
};

/** Familles utilisées pour filtrer le flux d'évènements du tableau de bord. */
export const ADMIN_EVENT_CATEGORIES = [
  "calendar",
  "payment",
  "shop",
  "wallet",
] as const;
export type AdminEventCategory = (typeof ADMIN_EVENT_CATEGORIES)[number];

export const ADMIN_EVENT_CATEGORY_LABELS: Record<AdminEventCategory, string> = {
  calendar: "Calendrier",
  payment: "Paiements",
  shop: "Boutique",
  wallet: "Wallet",
};

export function adminEventCategory(type: AdminEventType): AdminEventCategory {
  if (type.startsWith("order.") || type.startsWith("review.")) return "shop";
  if (type.startsWith("transfer.")) return "wallet";
  if (type.startsWith("payment.") || type.startsWith("substitute."))
    return "payment";
  if (type.startsWith("referee.")) return "calendar";
  return "calendar";
}

export const LIMITS = {
  nameMin: 1,
  nameMax: 50,
  emailMax: 254,
  passwordMin: 8,
  passwordMax: 128,
  addressMax: 200,
  descriptionMax: 2000,
  titleMax: 120,
  productNameMax: 120,
  imageUrlMax: 2048,
  imagesPerProduct: 6,
  imagesPerVenue: 8,
  venueNameMax: 80,
  reviewCommentMax: 800,
  searchQueryMax: 60,
  /** Une séance de deux heures tient rarement en une prise, jamais en dix. */
  videosPerSession: 6,
  videoUrlMax: 2048,
  videoLabelMax: 80,
  transferMaxUno: 1_000_000,
  pageSizeDefault: 20,
  pageSizeMax: 100,
  /** Taille maximale d'une photo uploadée, en octets (SEC-005). */
  uploadMaxBytes: 5 * 1024 * 1024,
} as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// ---------------------------------------------------------------------------
// Carte joueur (style FUT)
// ---------------------------------------------------------------------------

/** Postes de futsal proposés au joueur. */
export const PLAYER_POSITIONS = ["GB", "DEF", "MIL", "ATT"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const POSITION_LABELS: Record<PlayerPosition, string> = {
  GB: "Gardien",
  DEF: "Défenseur",
  MIL: "Milieu",
  ATT: "Attaquant",
};

/** Poste attribué par défaut tant que le joueur n'a pas choisi. */
export const DEFAULT_POSITION: PlayerPosition = "MIL";

/**
 * Aspect de la carte, déterminé par la division (D1 or, D2 argent, D3 bronze).
 * La division se lit ainsi d'un coup d'œil, dans une liste de participants
 * comme sur un podium.
 */
export type CardTier = "gold" | "silver" | "bronze" | "referee";

/**
 * L'arbitre n'a pas de division : il ne joue pas, ne marque pas, ne monte ni
 * ne descend. Sa carte est donc verte, hors hiérarchie, et se reconnaît d'un
 * coup d'œil dans une liste de participants.
 */
export function cardTier(division: Division, type: AccountType = "player"): CardTier {
  if (type === "referee") return "referee";

  switch (division) {
    case "D1":
      return "gold";
    case "D2":
      return "silver";
    default:
      return "bronze";
  }
}

export const TIER_LABELS: Record<CardTier, string> = {
  gold: "Or",
  silver: "Argent",
  bronze: "Bronze",
  referee: "Arbitre",
};

/**
 * Note globale affichée sur la carte, entre 50 et 99.
 *
 * Le cahier des charges ne définit pas de note globale : ce barème versionné
 * en tient lieu. Il est dérivé du score de classement, avec une progression
 * logarithmique — les premiers matchs font gagner beaucoup de points, les
 * suivants de moins en moins. Trois propriétés recherchées :
 *
 *  - un joueur qui vient de s'inscrire affiche 50, jamais 0 ;
 *  - la note ne dépasse jamais 99, quel que soit le nombre de matchs ;
 *  - elle est strictement croissante avec les performances.
 *
 * `RATING_SCALE` règle la vitesse de progression : plus il est grand, plus il
 * faut de performances pour gagner un point.
 */
export const RATING_FORMULA_VERSION = 1;
export const RATING_MIN = 50;
export const RATING_MAX = 99;
/**
 * Vitesse de progression de la note. Exprimée dans l'unité des points de
 * classement : avec 1,5 point par but, 100 points correspondent à une saison
 * déjà consistante, et la note approche alors 80.
 */
export const RATING_SCALE = 90;

/**
 * Évolution de la note au fil des sessions (CARD-002).
 *
 * La note dérivée de la carrière ne pouvait que monter : un total cumulé ne
 * décroît pas. Une carte qui ne redescend jamais ne dit plus rien de la forme
 * du joueur — c'est le reproche du client.
 *
 * La note devient donc un **compteur de forme**, déplacé à chaque session
 * classée : plus de points qu'à la session précédente, elle monte ; moins,
 * elle descend ; autant, elle ne bouge pas. La comparaison porte sur les
 * points du barème général (§ RANKING_WEIGHTS), ceux-là mêmes qui décident du
 * classement de session.
 *
 *  - `RATING_MOVE_SPAN` : écart de points qui vaut un cran supplémentaire.
 *    Un écart plus petit déplace quand même la note d'un point — la règle est
 *    « plus ou moins », pas « beaucoup plus ou beaucoup moins ».
 *  - `RATING_MOVE_MAX` : plafond par session, pour qu'un match exceptionnel
 *    ne fasse pas basculer une carte de dix points d'un coup.
 *
 * La note reste bornée entre RATING_MIN et RATING_MAX.
 */
export const RATING_MOVEMENT_VERSION = 2;
export const RATING_MOVE_SPAN = 3;
export const RATING_MOVE_MAX = 3;

/**
 * Bande de note propre à chaque division (CARD-003).
 *
 * **Le défaut corrigé** : toutes les cartes partaient de 50 et se déplaçaient
 * d'un à trois points par séance. Un très bon joueur de D1 plafonnait à 55 —
 * autant qu'un débutant de D3 après trois bonnes soirées. La note disait la
 * forme récente, mais plus du tout le niveau, et les deux se confondaient.
 *
 * La division fixe donc désormais le **socle**, et la forme fait bouger la
 * note à l'intérieur de sa bande :
 *
 *   D3 : 50 → 72     D2 : 62 → 84     D1 : 74 → 99
 *
 * Les bandes se chevauchent volontairement. Un D3 en pleine réussite (70)
 * dépasse un D2 en difficulté (63), ce qui est juste : le classement dit qui
 * est le meilleur de sa division, la note dit ce que vaut le joueur. Un
 * recouvrement d'une dizaine de points laisse les deux coexister sans qu'une
 * montée de division soit une simple formalité arithmétique.
 *
 * Une montée ou une descente **replace** la note dans la nouvelle bande :
 * monter en D1 avec 68 donne 74, et c'est la récompense visible de la montée.
 * Une descente n'écrase pas la note pour autant — elle n'est ramenée que si
 * elle dépassait le plafond de la division d'arrivée.
 */
export const RATING_BANDS: Record<Division, { floor: number; ceiling: number }> = {
  D3: { floor: 50, ceiling: 72 },
  D2: { floor: 62, ceiling: 84 },
  D1: { floor: 74, ceiling: RATING_MAX },
};

/** Statistiques affichées sur la carte, dans l'ordre des six emplacements. */
/**
 * Statistiques d'un arbitre.
 *
 * Un arbitre n'a ni buts, ni passes, ni division : afficher des zéros à leur
 * place donnerait l'image d'un joueur médiocre plutôt que d'un arbitre. Sa
 * carte montre donc ce qui le concerne — les sessions qu'il a dirigées — et
 * rien d'autre.
 */
export const REFEREE_CARD_STAT_SLOTS = [
  { key: "sessionsRefereed", label: "ARB" },
] as const;

export const CARD_STAT_SLOTS = [
  { key: "goals", label: "BUT" },
  { key: "assists", label: "PAS" },
  { key: "defenses", label: "DÉF" },
  { key: "saves", label: "ARR" },
  { key: "motm", label: "MOT" },
  { key: "matchesPlayed", label: "MAT" },
] as const;

export type CardStatKey = (typeof CARD_STAT_SLOTS)[number]["key"];

// ---------------------------------------------------------------------------
// Mode SQUAD (SQUAD-001)
// ---------------------------------------------------------------------------

/**
 * Un SQUAD est une équipe permanente, à la manière d'un club.
 *
 * Le mode se distingue des sessions UNO League sur un point structurant :
 * l'équipe **survit au match**. Une session League tire trois équipes au sort
 * et les oublie ; un SQUAD garde ses joueurs, sa cote, sa trésorerie et son
 * histoire d'un défi à l'autre. Tout le modèle en découle.
 */

export const SQUAD_ROLES = ["founder", "captain", "member"] as const;
export type SquadRole = (typeof SQUAD_ROLES)[number];

export const SQUAD_ROLE_LABELS: Record<SquadRole, string> = {
  founder: "Fondateur",
  captain: "Capitaine",
  member: "Membre",
};

/**
 * Hiérarchie des rôles, du plus étendu au plus restreint.
 *
 * Nommer l'ordre une fois évite les comparaisons dispersées du genre
 * `role === "founder" || role === "captain"`, qui finissent par diverger d'un
 * appel à l'autre.
 */
export const SQUAD_ROLE_RANK: Record<SquadRole, number> = {
  founder: 3,
  captain: 2,
  member: 1,
};

/** Vrai si `role` détient au moins les droits de `required`. */
export function squadRoleAtLeast(role: SquadRole, required: SquadRole): boolean {
  return SQUAD_ROLE_RANK[role] >= SQUAD_ROLE_RANK[required];
}

export const SQUAD_MEMBER_STATUSES = ["active", "left", "removed"] as const;
export type SquadMemberStatus = (typeof SQUAD_MEMBER_STATUSES)[number];

export const SQUAD_JOIN_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
] as const;
export type SquadJoinStatus = (typeof SQUAD_JOIN_STATUSES)[number];

/**
 * Cote de départ d'un SQUAD, et vitesse de son déplacement (SQUAD-007).
 *
 * Barème de type Elo, volontairement **indépendant des mises** : la
 * spécification insiste, et elle a raison — une équipe riche qui mise gros ne
 * devient pas meilleure pour autant. Force sportive et activité économique
 * sont deux mesures séparées, et les mélanger rendrait le classement illisible.
 *
 * `SQUAD_RATING_K` règle l'amplitude : à 32, battre un adversaire de même
 * niveau rapporte 16 points, une victoire très improbable jusqu'à 32.
 */
export const SQUAD_RATING_INITIAL = 1000;
export const SQUAD_RATING_K = 32;

/** Durées possibles d'un défi, en minutes (SQUAD-004). */
export const SQUAD_MATCH_DURATIONS = [60, 120] as const;
export type SquadMatchDuration = (typeof SQUAD_MATCH_DURATIONS)[number];

/** Joueurs par équipe dans un défi : cinq, sans remplaçant (SQUAD-005). */
export const SQUAD_ROSTER_SIZE = 5;

export const SQUAD_LIMITS = {
  nameMin: 3,
  nameMax: 40,
  slugMax: 40,
  descriptionMax: 500,
  messageMax: 1000,
  /** Contre-offres maximales, pour un défi comme pour un transfert. */
  negotiationRounds: 3,
  /** Délai au terme duquel un défi sans réponse expire, en heures. */
  challengeExpiryHours: 24,
  /** Carence entre deux transferts d'un même joueur, en jours. */
  transferCooldownDays: 7,
} as const;

/**
 * Prix d'une place dans un défi SQUAD (SQUAD-006).
 *
 * **Chaque joueur paie sa place, comme en League.** Le client l'a tranché :
 * dix euros pour une heure, vingt pour deux, par personne et hors mise. La
 * caisse du club peut en prendre une ou plusieurs à sa charge — c'est une
 * décision du fondateur, pas un droit du joueur.
 *
 * Le prix est exprimé en euros parce que c'est le tarif de la salle ; la
 * conversion en UNO suit le ratio officiel, et les deux montants sont donc
 * toujours cohérents.
 */
export const SQUAD_SEAT_PRICE_EUR: Record<SquadMatchDuration, number> = {
  60: 10,
  120: 20,
};

export const SQUAD_SEAT_PRICE_UNO: Record<SquadMatchDuration, number> = {
  60: SQUAD_SEAT_PRICE_EUR[60] * UNO_PER_EUR,
  120: SQUAD_SEAT_PRICE_EUR[120] * UNO_PER_EUR,
};

/** Prix d'une place, en UNO, pour une durée de défi donnée. */
export function squadSeatPriceUno(durationMinutes: number): number {
  const price = SQUAD_SEAT_PRICE_UNO[durationMinutes as SquadMatchDuration];
  if (price === undefined) {
    throw new Error(`Durée de défi inconnue : ${durationMinutes}`);
  }
  return price;
}

/**
 * États d'une place.
 *
 * `released` couvre les deux façons de perdre sa place — un capitaine qui
 * remanie sa composition, un défi annulé — et non pas une seule : dans les
 * deux cas ce qui a été payé revient d'où il venait, et la ligne reste pour
 * que le mouvement se relise.
 */
export const SQUAD_SEAT_STATUSES = ["pending", "paid", "released"] as const;
export type SquadSeatStatus = (typeof SQUAD_SEAT_STATUSES)[number];

/** Qui a réglé la place : le joueur lui-même, ou la caisse du club. */
export const SQUAD_SEAT_SOURCES = ["player", "treasury"] as const;
export type SquadSeatSource = (typeof SQUAD_SEAT_SOURCES)[number];
