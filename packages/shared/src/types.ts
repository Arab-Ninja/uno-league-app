import type {
  AccountType,
  AnnouncementType,
  CardTier,
  Division,
  DivisionMovement,
  GameModeId,
  PaymentMethod,
  PlayerPosition,
  RankingSort,
  ShopCategory,
  SizeKind,
  TransactionType,
} from "./constants.js";
import type {
  MatchStatus,
  OrderStatus,
  PaymentStatus,
  ProposalStatus,
} from "./states.js";

/**
 * Contrats de données exposés par l'API (CDC §18).
 *
 * Ces types décrivent ce que le serveur renvoie au client. Ils excluent
 * délibérément tout champ sensible (hash de mot de passe, jeton de session,
 * identifiants PSP bruts) conformément à ROLE-002 et SEC-007.
 */

export type UserRole = "user" | "admin";

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  playerId: number;
}

/** Profil complet, renvoyé uniquement au joueur propriétaire ou à un admin. */
export interface PlayerProfile {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  address: string | null;
  nationality: string;
  dateOfBirth: string;
  profilePhotoUrl: string | null;
  /** Cadrage vertical de la photo sur la carte, en pourcentage. */
  photoOffsetY: number;
  /** Joueur ou arbitre (ROLE-003), fixé à l'inscription. */
  accountType: AccountType;
  sessionsRefereed: number;
  division: Division;
  position: PlayerPosition;
  unoPoints: number;
  xp: number;
  level: number;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  motm: number;
  matchesPlayed: number;
  /** Note globale de la carte, dérivée des statistiques (50 à 99). */
  rating: number;
  /** Aspect de la carte, déterminé par la division. */
  tier: CardTier;
  createdAt: string;
}

/**
 * Vue publique d'un joueur : classements, participants, recherche wallet.
 *
 * Contient tout ce qu'il faut pour dessiner sa carte, et rien de plus : ni
 * email, ni adresse, ni solde (ROLE-002).
 */
export interface PublicPlayer {
  id: number;
  displayName: string;
  nationality: string;
  profilePhotoUrl: string | null;
  photoOffsetY: number;
  /** Joueur ou arbitre : détermine ce que la carte affiche (ROLE-003). */
  accountType: AccountType;
  division: Division;
  position: PlayerPosition;
  level: number;
  rating: number;
  tier: CardTier;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  motm: number;
  matchesPlayed: number;
  /** Sessions arbitrées ; le seul compteur qui ait un sens pour un arbitre. */
  sessionsRefereed: number;
}

export interface LeaderboardEntry {
  position: number;
  player: PublicPlayer;
  /** Valeur du critère de tri retenu. */
  value: number;
  sort: RankingSort;
  /** Points de classement général, toujours renseignés. */
  points: number;
}

export interface ProposalParticipantView {
  player: PublicPlayer;
  hasPaid: boolean;
  joinedAt: string;
  /** Rang au classement de la session, une fois celle-ci clôturée. */
  sessionRank: number | null;
  sessionPoints: number | null;
  movement: DivisionMovement | null;
}

/** Candidat au remplacement d'une place non réglée (CAL-008). */
export interface SubstituteView {
  player: PublicPlayer;
  status: "waiting" | "promoted" | "withdrawn";
  createdAt: string;
}

/** Distinction mise à l'honneur sur le podium d'une session terminée. */
export type PodiumAward = "topScorer" | "topAssist" | "topDefender" | "motm";

export interface PodiumEntry {
  award: PodiumAward;
  label: string;
  /** Valeur réalisée sur la session, ex. 3 buts. */
  value: number;
  player: PublicPlayer;
}

export interface ProposalSummary {
  id: number;
  status: ProposalStatus;
  modeId: GameModeId;
  venueId: string;
  venueName: string;
  /** Instant UTC ISO 8601 du coup d'envoi. */
  startsAtUtc: string;
  /** Heure murale locale du lieu, ex. "18:00 - 20:00". */
  localTimeLabel: string;
  localDate: string;
  timezone: string;
  division: Division | null;
  priceEur: number;
  priceUno: number;
  minParticipants: number;
  participantCount: number;
  paidCount: number;
  paymentComplete: boolean;
  /**
   * Échéance de règlement (CAL-008), en UTC ISO 8601. `null` tant que la
   * proposition n'est pas devenue réservation.
   */
  paymentDeadline: string | null;
  creatorPlayerId: number;
  /** Champs dérivés pour le joueur courant, absents si non authentifié. */
  viewer?: {
    isParticipant: boolean;
    hasPaid: boolean;
  };
}

export interface ProposalDetail extends ProposalSummary {
  participants: ProposalParticipantView[];
  rewards: { kind: string; label: string; amountUno: number }[];
  substitutes: SubstituteView[];
  /**
   * Arbitre de la session (ROLE-003). Un seul, en UNO League uniquement.
   * `null` tant que personne ne s'est proposé.
   */
  referee: PublicPlayer | null;
  /**
   * Place libérable : une inscription non réglée dont l'échéance est passée.
   * Le serveur la calcule pour que l'interface n'ait pas à comparer des
   * dates elle-même, et donc à se tromper de fuseau.
   */
  claimableSeats: { player: PublicPlayer; overdueSince: string }[];
}

/**
 * Ce qu'une ligne du registre permet d'ouvrir (WAL-004).
 *
 * Une écriture financière renvoie toujours à quelque chose de concret : une
 * session, une commande, un joueur. Le lien est **résolu par le serveur**,
 * qui seul connaît la chaîne — un frais de session pointe vers un paiement,
 * lequel pointe vers la proposition. Le client se contenterait de deviner.
 *
 * `null` pour les écritures qui ne mènent nulle part : bonus de bienvenue,
 * ajustement administratif.
 */
export interface TransactionLink {
  kind: "session" | "order" | "player";
  id: number;
  /** Libellé du bouton, ex. « Voir la session ». */
  label: string;
}

export interface WalletTransaction {
  id: number;
  type: TransactionType;
  /** Montant signé : négatif pour un débit, positif pour un crédit. */
  amount: number;
  balanceAfter: number;
  description: string;
  counterpartyName: string | null;
  createdAt: string;
  link: TransactionLink | null;
}

export interface ShopItemView {
  id: number;
  name: string;
  description: string;
  category: ShopCategory;
  priceUno: number;
  priceEuros: number | null;
  images: string[];
  productUrl: string | null;
  available: boolean;
  stock: number | null;
  /** Déclinaison : taille unique, tailles de vêtement ou pointures. */
  sizeKind: SizeKind;
  /** Tailles réellement proposées, déjà résolues par le serveur. */
  sizes: string[];
  /** Note moyenne sur 5, `null` tant qu'aucun avis n'a été publié. */
  ratingAverage: number | null;
  ratingCount: number;
}

export interface ProductReviewView {
  id: number;
  player: PublicPlayer;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
  /** Vrai s'il s'agit de l'avis du joueur qui consulte : il peut le modifier. */
  mine: boolean;
}

export interface OrderLineView {
  shopItemId: number | null;
  productName: string;
  unitPriceUno: number;
  quantity: number;
  totalUno: number;
  /** Taille ou pointure commandée ; null pour un article en taille unique. */
  size: string | null;
}

export interface OrderView {
  id: number;
  status: OrderStatus;
  totalUno: number;
  createdAt: string;
  fulfilledAt: string | null;
  items: OrderLineView[];
  /**
   * Vrai tant que le joueur peut annuler lui-même : la commande n'a pas
   * encore été confirmée par l'administration (SHOP-005). Calculé par le
   * serveur, seul juge de ce qui est annulable.
   */
  cancellable: boolean;
}

export interface AnnouncementView {
  id: number;
  type: AnnouncementType;
  title: string;
  content: string;
  publishedAt: string;
  expiresAt: string | null;
  read: boolean;
}

export interface TeamView {
  id: number;
  name: string;
  teamIndex: number;
  players: PublicPlayer[];
}

export interface MatchView {
  id: number;
  proposalId: number;
  /** Rang du match dans la séance, à partir de 1. */
  matchOrder: number;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  playedAt: string | null;
  teamA: TeamView | null;
  teamB: TeamView | null;
}

export interface MatchHistoryEntry {
  proposalId: number;
  startsAtUtc: string;
  localDate: string;
  localTimeLabel: string;
  venueName: string;
  modeId: GameModeId;
  status: ProposalStatus;
}

export interface PaymentIntentView {
  paymentId: number;
  status: PaymentStatus;
  method: PaymentMethod;
  amountUno: number;
  amountEurCents: number;
  /** URL de redirection vers le prestataire, pour un paiement externe. */
  redirectUrl: string | null;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: number | null;
}

/**
 * Vue « carte » d'un profil complet.
 *
 * Le profil du joueur connecté contient tout ce qu'il faut pour dessiner sa
 * carte, plus des données personnelles. Cette fonction extrait le sous-ensemble
 * public, en un seul endroit : recopier la liste des champs à chaque écran
 * casserait dès l'ajout d'un champ à la carte.
 */
export function toCardPlayer(profile: PlayerProfile): PublicPlayer {
  return {
    id: profile.id,
    displayName: profile.displayName,
    nationality: profile.nationality,
    profilePhotoUrl: profile.profilePhotoUrl,
    photoOffsetY: profile.photoOffsetY,
    accountType: profile.accountType,
    division: profile.division,
    position: profile.position,
    level: profile.level,
    rating: profile.rating,
    tier: profile.tier,
    goals: profile.goals,
    assists: profile.assists,
    defenses: profile.defenses,
    saves: profile.saves,
    motm: profile.motm,
    matchesPlayed: profile.matchesPlayed,
    sessionsRefereed: profile.sessionsRefereed,
  };
}
