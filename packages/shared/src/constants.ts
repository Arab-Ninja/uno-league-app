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
  "paypal",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  uno: "Points UNO",
  stripe_card: "Carte bancaire",
  stripe_bancontact: "Bancontact",
  paypal: "PayPal",
};

export const EXTERNAL_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (m) => m !== "uno",
) as readonly PaymentMethod[];

// ---------------------------------------------------------------------------
// Limites de validation partagées client/serveur (SEC-003)
// ---------------------------------------------------------------------------

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
export type CardTier = "gold" | "silver" | "bronze";

export function cardTier(division: Division): CardTier {
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
export const RATING_SCALE = 300;

/** Statistiques affichées sur la carte, dans l'ordre des six emplacements. */
export const CARD_STAT_SLOTS = [
  { key: "goals", label: "BUT" },
  { key: "assists", label: "PAS" },
  { key: "defenses", label: "DÉF" },
  { key: "saves", label: "ARR" },
  { key: "motm", label: "MOT" },
  { key: "matchesPlayed", label: "MAT" },
] as const;

export type CardStatKey = (typeof CARD_STAT_SLOTS)[number]["key"];
