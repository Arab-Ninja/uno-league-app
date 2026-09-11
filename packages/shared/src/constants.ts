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
export const XP_POLICY_VERSION = 1;
export const XP_PER_LEVEL = 500;

export const XP_AWARDS = {
  sessionPlayed: 50,
  goal: 20,
  assist: 10,
  defense: 5,
  save: 5,
  motm: 100,
} as const;

export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return SIGNUP_LEVEL;
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/** Progression (0 → 1) à l'intérieur du niveau courant. */
export function levelProgress(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return (xp % XP_PER_LEVEL) / XP_PER_LEVEL;
}

export function xpToNextLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return XP_PER_LEVEL;
  return XP_PER_LEVEL - (xp % XP_PER_LEVEL);
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
export const RATING_MOVEMENT_VERSION = 1;
export const RATING_MOVE_SPAN = 3;
export const RATING_MOVE_MAX = 3;

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
