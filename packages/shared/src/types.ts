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
  SquadJoinStatus,
  SquadRole,
  SquadSeatSource,
  SquadSeatStatus,
  TransactionType,
} from "./constants.js";
import type {
  MatchStatus,
  OrderStatus,
  PaymentStatus,
  ProposalStatus,
} from "./states.js";
import type { SquadChallengeStatus } from "./squad-challenges.js";
import type { VideoProvider } from "./videos.js";

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
  /**
   * Droit de saisir les feuilles de match (SUP-001).
   *
   * Il voyage avec la session pour que la navigation sache quoi proposer.
   * Ce n'est **pas** ce qui autorise l'accès : chaque route le revérifie en
   * base — un droit retiré ferme la porte à l'appel suivant, même si l'écran
   * affiche encore le lien.
   */
  isSupervisor: boolean;
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
  /** Droit de saisir les feuilles de match (SUP-001), accordé par l'admin. */
  isSupervisor: boolean;
  /**
   * `null` pour un arbitre : il n'a pas de division (ROLE-003).
   *
   * La colonne en base en porte une par construction — l'énumération n'est
   * pas nullable — mais ce n'est qu'une valeur par défaut qui ne veut rien
   * dire pour lui. Le serveur la retire ici, une fois, plutôt que de laisser
   * chaque écran se souvenir de la cacher.
   */
  division: Division | null;
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
  /** `null` pour un arbitre : il n'a pas de division (ROLE-003). */
  division: Division | null;
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
  /** Superviseur : affiché sur la carte et dans les listes (SUP-001). */
  isSupervisor: boolean;
}

/**
 * Vidéo d'une session (SUP-002).
 *
 * `embedUrl` est construit par le serveur à partir du seul identifiant de la
 * vidéo, jamais recopié depuis l'adresse fournie : il vaut `null` dès que
 * l'hébergeur n'est pas reconnu, et la vidéo n'est alors qu'un lien.
 */
export interface SessionVideo {
  id: number;
  url: string;
  label: string | null;
  provider: VideoProvider;
  embedUrl: string | null;
  /** Nom du superviseur qui l'a ajoutée. */
  addedBy: string | null;
  createdAt: string;
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
  /**
   * Note de la carte avant et après cette session (CARD-002).
   *
   * `null` tant que la session n'est pas clôturée, et pour un mode non
   * classé — un amical ne dit rien de la forme en compétition.
   */
  ratingBefore: number | null;
  ratingAfter: number | null;
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
    isSupervisor: profile.isSupervisor,
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

// ---------------------------------------------------------------------------
// Saisie en visionnage (TRACK-001)
// ---------------------------------------------------------------------------

export type TrackerSessionStatus = "draft" | "published";
export type TrackerMatchStatus = "pending" | "playing" | "finished";

export interface TrackerTeamView {
  id: number;
  name: string;
  color: string;
  teamIndex: number;
}

/**
 * Un joueur inscrit sur la feuille de saisie.
 *
 * `playerId` est nul pour un invité : un joueur de passage se saisit d'un nom,
 * sans compte, pour ne pas interrompre le visionnage. Ses statistiques sont
 * relevées comme les autres, mais la publication exige qu'il soit rattaché à
 * un compte — sinon ses points iraient nulle part.
 */
export interface TrackerParticipantView {
  id: number;
  teamId: number;
  playerId: number | null;
  guestName: string | null;
  displayName: string;
  shirtNumber: number | null;
  player: PublicPlayer | null;
}

export interface TrackerMatchView {
  id: number;
  sessionId: number;
  matchOrder: number;
  teamAId: number;
  teamBId: number;
  status: TrackerMatchStatus;
  /** Position du coup d'envoi dans la vidéo, en millisecondes. */
  videoStartMs: number | null;
  /** Enregistrement dans lequel le coup d'envoi a été relevé (TRACK-001). */
  videoId: number | null;
  /** Score relevé sur la vidéo, pour contrôler la saisie. */
  declaredScoreA: number | null;
  declaredScoreB: number | null;
}

export interface TrackerEventView {
  clientId: string;
  matchId: number;
  type: string;
  participantId: number;
  assistParticipantId: number | null;
  teamId: number;
  clockMs: number;
  videoMs: number | null;
}

export interface TrackerVideo {
  id: number;
  label: string;
  /** `null` pour un fichier local, qui n'a pas d'adresse. */
  url: string | null;
}

export interface TrackerSessionSummary {
  id: number;
  label: string;
  localDate: string;
  slotStartHour: number;
  venueId: string | null;
  venueName: string | null;
  division: Division | null;
  modeId: string;
  status: TrackerSessionStatus;
  /**
   * Enregistrements de la séance (TRACK-001).
   *
   * Une entrée sans `url` est un fichier local : seul son nom est mémorisé,
   * le fichier lui-même se ré-ouvre depuis le disque à chaque visite.
   */
  videos: TrackerVideo[];
  participantCount: number;
  matchCount: number;
  eventCount: number;
  /** Session réservée à laquelle la saisie est rattachée, le cas échéant. */
  proposalId: number | null;
  publishedProposalId: number | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** Feuille complète : tout ce dont l'écran de saisie a besoin, en un appel. */
export interface TrackerSheet {
  session: TrackerSessionSummary;
  teams: TrackerTeamView[];
  participants: TrackerParticipantView[];
  matches: TrackerMatchView[];
  events: TrackerEventView[];
}

// ---------------------------------------------------------------------------
// Mode SQUAD (SQUAD-001)
// ---------------------------------------------------------------------------

/** Un membre d'un SQUAD, avec sa carte et son rôle. */
export interface SquadMemberView {
  player: PublicPlayer;
  role: SquadRole;
  joinedAt: string;
}

/**
 * Profil public d'un SQUAD.
 *
 * La trésorerie n'y figure pas : elle ne regarde que les membres, et une
 * équipe adverse n'a pas à jauger les moyens de celle qu'elle défie.
 */
export interface SquadView {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  founder: PublicPlayer | null;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Positive pour une série de victoires, négative pour des défaites. */
  streak: number;
  /** Pourcentage de victoires, arrondi ; `null` sans match joué. */
  winRate: number | null;
  totalUnoWon: number;
  memberCount: number;
  status: "active" | "dissolved";
  createdAt: string;
  /** Ce que le joueur qui regarde peut faire ici. */
  viewer: {
    role: SquadRole | null;
    hasPendingRequest: boolean;
    /** Faux s'il appartient déjà à un autre SQUAD. */
    mayRequestToJoin: boolean;
  };
}

/** Vue détaillée, réservée aux membres : trésorerie et effectif complet. */
export interface SquadDetailView extends SquadView {
  members: SquadMemberView[];
  treasury: {
    available: number;
    locked: number;
    total: number;
  } | null;
  pendingRequests: SquadJoinRequestView[];
}

export interface SquadJoinRequestView {
  id: number;
  player: PublicPlayer;
  message: string | null;
  status: SquadJoinStatus;
  createdAt: string;
}

/** Ce que l'application sait de l'affiliation du joueur connecté. */
export interface MySquadView {
  squad: SquadDetailView | null;
  /** Demandes que le joueur a lui-même déposées et qui attendent une réponse. */
  pendingRequests: { squad: SquadView; createdAt: string }[];
}

/** Une ligne du registre de trésorerie d'un SQUAD (SQUAD-003). */
export interface SquadTreasuryEntry {
  id: number;
  type: string;
  /** Montant signé : négatif pour une sortie, positif pour une entrée. */
  amount: number;
  balanceAfter: number;
  description: string;
  /** Le membre à l'origine du mouvement, quand il y en a un. */
  playerName: string | null;
  createdAt: string;
}

/** Identité minimale d'un club, telle qu'elle apparaît dans un défi. */
export interface SquadBadge {
  id: number;
  name: string;
  slug: string;
  rating: number;
  avatarUrl: string | null;
}

/** Un défi entre deux SQUADs (SQUAD-004). */
export interface SquadChallengeView {
  id: number;
  challenger: SquadBadge | null;
  challenged: SquadBadge | null;
  venueId: string;
  venueName: string;
  scheduledAt: string;
  durationMinutes: number;
  initialStake: number;
  currentStake: number;
  negotiationRound: number;
  /** Contre-offres encore possibles avant d'avoir à trancher. */
  counterOffersLeft: number;
  status: SquadChallengeStatus;
  expiresAt: string;
  matchId: number | null;
  createdAt: string;
  viewer: {
    /** Le club du joueur qui regarde, s'il est partie au défi. */
    squadId: number | null;
    /** Vrai quand c'est à son club de répondre. */
    awaitingReply: boolean;
    isChallenger: boolean;
  };
}

/** Une offre de mise, conservée même refusée : la négociation se relit. */
export interface SquadChallengeOfferView {
  id: number;
  squadId: number;
  squadName: string;
  playerName: string;
  stakeUno: number;
  roundNumber: number;
  createdAt: string;
}

/**
 * Une place dans un défi (SQUAD-006).
 *
 * Le prix y est figé à l'inscription : changer le tarif d'application ne doit
 * pas modifier ce qu'un joueur déjà inscrit doit, ni ce qu'un remboursement
 * lui rend.
 */
export interface SquadSeatView {
  id: number;
  player: PublicPlayer;
  priceUno: number;
  status: SquadSeatStatus;
  /** Renseigné une fois la place réglée. */
  paidBy: SquadSeatSource | null;
  paidAt: string | null;
}

/** La composition d'un club pour un défi, et l'état de ses paiements. */
export interface SquadRosterView {
  squad: SquadBadge | null;
  seats: SquadSeatView[];
  /** Places encore à pourvoir, sur les cinq du format. */
  openSlots: number;
  /** Total dû par le club pour ce défi, places non réglées comprises. */
  dueUno: number;
  /** Ce que le joueur qui regarde peut faire sur cette composition. */
  viewer: {
    /** Vrai s'il peut ajouter ou retirer un joueur (capitaine ou fondateur). */
    mayCompose: boolean;
    /** Vrai s'il peut engager la caisse du club (fondateur seul). */
    mayCover: boolean;
    /** L'identifiant de sa propre place, quand il en occupe une. */
    mySeatId: number | null;
  };
}

export interface SquadChallengeDetail extends SquadChallengeView {
  offers: SquadChallengeOfferView[];
  /**
   * La session du match, une fois créé — `null` avant.
   *
   * C'est par elle que passent la feuille de match, la saisie du résultat et
   * l'historique : un match SQUAD est une session comme une autre.
   */
  sessionId: number | null;
  /**
   * Les deux compositions, dans l'ordre défieur puis défié.
   *
   * Vide tant que le défi n'est pas accepté : composer une équipe pour un
   * match qui n'aura peut-être pas lieu ferait payer des places pour rien.
   */
  rosters: SquadRosterView[];
}

/** Un message d'un fil de discussion (SQUAD-005). */
export interface SquadMessageView {
  id: number;
  body: string;
  playerId: number;
  playerName: string;
  /** Le club au nom duquel l'auteur s'exprime, dans un chat de défi. */
  squadId: number | null;
  squadName: string | null;
  createdAt: string;
}
