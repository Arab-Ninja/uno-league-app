import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { RATING_MAX, RATING_MIN, SQUAD_RATING_INITIAL } from "@uno/shared";

/**
 * Modèle de données normatif (CDC §5).
 *
 * Règles transverses appliquées ici :
 *  - toutes les dates sont stockées en UTC (TECH-002) ; la connexion MySQL
 *    est ouverte avec timezone "Z" pour qu'aucune conversion implicite
 *    n'intervienne ;
 *  - UNO, XP, niveau et statistiques sont des entiers contraints >= 0 par des
 *    CHECK constraints, en plus des validations applicatives (DATA-002) ;
 *  - les clés d'idempotence sont uniques en base : c'est la base de données,
 *    et non le code applicatif, qui empêche un double débit (STATE-002).
 */

const now = sql`CURRENT_TIMESTAMP(3)`;

// ---------------------------------------------------------------------------
// Comptes et sessions
// ---------------------------------------------------------------------------

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    /** Hash scrypt ; jamais le mot de passe en clair (SEC-001, AUTH-002). */
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: mysqlEnum("role", ["user", "admin"]).notNull().default("user"),
    status: mysqlEnum("status", [
      "active",
      "suspended",
      "deleted",
      "anonymized",
    ])
      .notNull()
      .default("active"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
    lastSignedIn: datetime("last_signed_in", { fsp: 3 }),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

/**
 * Sessions serveur (SEC-001, AUTH-005).
 * Seul le hash SHA-256 du jeton est stocké : une fuite de base ne permet pas
 * de rejouer une session. La révocation est immédiate par suppression.
 */
export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    lastUsedAt: datetime("last_used_at", { fsp: 3 }).notNull().default(now),
    userAgent: varchar("user_agent", { length: 255 }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Joueurs
// ---------------------------------------------------------------------------

export const players = mysqlTable(
  "players",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 50 }).notNull(),
    lastName: varchar("last_name", { length: 50 }).notNull(),
    displayName: varchar("display_name", { length: 101 }).notNull(),
    address: varchar("address", { length: 200 }),
    nationality: varchar("nationality", { length: 2 }).notNull(),
    dateOfBirth: varchar("date_of_birth", { length: 10 }).notNull(),
    profilePhotoUrl: varchar("profile_photo_url", { length: 2048 }),
    /**
     * Cadrage vertical de la photo sur la carte, en pourcentage (0 = haut,
     * 100 = bas). Un portrait n'est jamais cadré de la même façon d'une
     * personne à l'autre : plutôt que de deviner, le joueur ajuste lui-même.
     */
    photoOffsetY: int("photo_offset_y").notNull().default(35),
    /**
     * Joueur ou arbitre (ROLE-003). Choisi à l'inscription, modifiable
     * ensuite par l'administration seule : un arbitre qui deviendrait joueur
     * du jour au lendemain fausserait les sessions qu'il a arbitrées.
     */
    accountType: mysqlEnum("account_type", ["player", "referee"])
      .notNull()
      .default("player"),
    /**
     * Sessions arbitrées. C'est le seul compteur qui a un sens pour un
     * arbitre : il n'a ni buts, ni passes, ni division.
     */
    sessionsRefereed: int("sessions_refereed").notNull().default(0),
    /**
     * Superviseur : autorisé à saisir les feuilles de match (SUP-001).
     *
     * C'est un droit qui s'ajoute au compte, il ne le remplace pas : un
     * superviseur reste joueur ou arbitre par ailleurs. Seule
     * l'administration l'accorde et le retire — un joueur ne peut pas se
     * l'attribuer, la saisie décidant des récompenses et des divisions.
     */
    isSupervisor: boolean("is_supervisor").notNull().default(false),
    division: mysqlEnum("division", ["D1", "D2", "D3"])
      .notNull()
      .default("D3"),
    /** Poste de futsal, affiché sur la carte joueur. */
    position: mysqlEnum("position", ["GB", "DEF", "MIL", "ATT"])
      .notNull()
      .default("MIL"),
    unoPoints: int("uno_points").notNull().default(0),
    xp: int("xp").notNull().default(0),
    level: int("level").notNull().default(1),
    goals: int("goals").notNull().default(0),
    assists: int("assists").notNull().default(0),
    defenses: int("defenses").notNull().default(0),
    saves: int("saves").notNull().default(0),
    motm: int("motm").notNull().default(0),
    /**
     * Nombre de sessions jouées. Compteur dénormalisé, incrémenté à la
     * clôture d'une session : la carte joueur l'affiche pour chaque
     * participant d'une liste, et le recalculer par jointure à chaque
     * affichage serait coûteux pour rien.
     */
    matchesPlayed: int("matches_played").notNull().default(0),
    /**
     * Note globale de la carte (CARD-002).
     *
     * Stockée, et non dérivée : elle doit pouvoir **descendre**, ce qu'un
     * total de carrière ne permet pas. Elle se déplace à la clôture de chaque
     * session classée, selon que le joueur a fait mieux ou moins bien qu'à sa
     * session précédente.
     *
     * Stockée ne veut pas dire invérifiable : chaque déplacement laisse la
     * note d'avant et d'après sur `proposal_participants`, si bien que la
     * valeur courante se relit comme la somme d'une histoire, et qu'une
     * correction de session sait exactement quoi défaire.
     */
    rating: int("rating").notNull().default(RATING_MIN),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("players_user_unique").on(table.userId),
    index("players_division_idx").on(table.division),
    index("players_display_name_idx").on(table.displayName),
    // DATA-002 : aucune valeur négative ne peut être écrite, même par erreur
    // applicative ou par un script d'administration.
    check("players_uno_non_negative", sql`${table.unoPoints} >= 0`),
    check("players_xp_non_negative", sql`${table.xp} >= 0`),
    check("players_level_min", sql`${table.level} >= 1`),
    check("players_goals_non_negative", sql`${table.goals} >= 0`),
    check("players_assists_non_negative", sql`${table.assists} >= 0`),
    check("players_defenses_non_negative", sql`${table.defenses} >= 0`),
    check("players_saves_non_negative", sql`${table.saves} >= 0`),
    check("players_motm_non_negative", sql`${table.motm} >= 0`),
    // DATA-002 : la note reste dans ses bornes même si un calcul dérape.
    check(
      "players_rating_range",
      sql`${table.rating} BETWEEN ${RATING_MIN} AND ${RATING_MAX}`,
    ),
    // Pas de CHECK sur matchesPlayed : l'ajouter imposerait un
    // ALTER TABLE ... ADD CONSTRAINT CHECK sur les bases déjà migrées, forme
    // que TiDB refuse. Le compteur n'est de toute façon qu'incrémenté.
  ],
);

// ---------------------------------------------------------------------------
// Saisons (RANK-005)
// ---------------------------------------------------------------------------

export const seasons = mysqlTable("seasons", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 60 }).notNull(),
  startsAt: datetime("starts_at", { fsp: 3 }).notNull(),
  endsAt: datetime("ends_at", { fsp: 3 }).notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  /** Nombre de joueurs promus/relégués : jamais codé en dur dans l'UI. */
  promotionCount: int("promotion_count").notNull().default(3),
  relegationCount: int("relegation_count").notNull().default(3),
  rewardPolicyVersion: int("reward_policy_version").notNull().default(1),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
});

// ---------------------------------------------------------------------------
// Lieux (ADMIN-007)
// ---------------------------------------------------------------------------

/**
 * Salles où se jouent les sessions.
 *
 * Le lieu était jusqu'ici une constante du code : ajouter une salle imposait
 * un déploiement. Il devient une entité administrable, avec sa présentation
 * et ses photos, affichée dans l'écran Informations.
 *
 * Les propositions continuent de recopier `venueId` et `venueName` : renommer
 * ou retirer une salle ne doit pas réécrire l'historique des sessions déjà
 * jouées.
 */
export const venues = mysqlTable(
  "venues",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Identifiant stable et lisible, repris par les propositions. */
    slug: varchar("slug", { length: 40 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    /** Titre d'accroche affiché au-dessus de la description. */
    headline: varchar("headline", { length: 120 }),
    description: text("description").notNull(),
    address: varchar("address", { length: 200 }),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    images: json("images").$type<string[]>().notNull(),
    /** Une salle retirée n'est plus proposée mais reste lisible (ADMIN-004). */
    active: boolean("active").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("venues_slug_unique").on(table.slug),
    index("venues_active_idx").on(table.active, table.sortOrder),
  ],
);

// ---------------------------------------------------------------------------
// Propositions / réservations / sessions
// ---------------------------------------------------------------------------

export const proposals = mysqlTable(
  "proposals",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Instant du coup d'envoi, en UTC (TECH-002). */
    startsAtUtc: datetime("starts_at_utc", { fsp: 3 }).notNull(),
    /** Heure murale locale du lieu, conservée pour l'affichage et le tri. */
    localDate: varchar("local_date", { length: 10 }).notNull(),
    slotStartHour: int("slot_start_hour").notNull(),
    localTimeLabel: varchar("local_time_label", { length: 20 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    venueId: varchar("venue_id", { length: 40 }).notNull(),
    venueName: varchar("venue_name", { length: 80 }).notNull(),
    modeId: varchar("mode_id", { length: 20 }).notNull(),
    /** null pour un match amical : ouvert à toutes les divisions (CAL-002). */
    division: mysqlEnum("division", ["D1", "D2", "D3"]),
    minParticipants: int("min_participants").notNull(),
    priceEur: int("price_eur").notNull(),
    priceUno: int("price_uno").notNull(),
    rewardPolicyVersion: int("reward_policy_version").notNull().default(1),
    status: mysqlEnum("status", [
      "proposal",
      "reservation",
      "session",
      "completed",
      "cancelled",
    ])
      .notNull()
      .default("proposal"),
    participantCount: int("participant_count").notNull().default(0),
    paidCount: int("paid_count").notNull().default(0),
    paymentComplete: boolean("payment_complete").notNull().default(false),
    /**
     * Échéance de règlement (CAL-008). Posée à l'instant où la proposition
     * devient réservation ; au-delà, une place non payée peut être reprise
     * par un remplaçant. `null` tant que la proposition est ouverte.
     */
    paymentDeadline: datetime("payment_deadline", { fsp: 3 }),
    /**
     * Homme du match de la session, calculé à la clôture d'après le total de
     * points : stocké pour que le podium reste stable si les statistiques
     * de carrière évoluent ensuite.
     */
    motmPlayerId: int("motm_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    /**
     * Arbitre de la session (ROLE-003). Un seul par session, réservé au mode
     * UNO League. Il n'est pas un participant : il ne paie pas, ne compte pas
     * dans le quota et n'entre pas dans les équipes.
     */
    refereePlayerId: int("referee_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    creatorPlayerId: int("creator_player_id")
      .notNull()
      .references(() => players.id),
    seasonId: int("season_id").references(() => seasons.id),
    /**
     * Clé de déduplication (CAL-005) : "venue|date|heure|mode".
     * Renseignée tant que la proposition est active, mise à NULL lorsqu'elle
     * est annulée ou terminée — MySQL n'applique pas l'unicité aux NULL, ce
     * qui libère le créneau pour une nouvelle proposition.
     */
    activeSlotKey: varchar("active_slot_key", { length: 120 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("proposals_active_slot_unique").on(table.activeSlotKey),
    index("proposals_starts_at_idx").on(table.startsAtUtc),
    index("proposals_status_idx").on(table.status),
    index("proposals_local_date_idx").on(table.localDate),
    check("proposals_counts_non_negative", sql`${table.participantCount} >= 0`),
    check("proposals_paid_non_negative", sql`${table.paidCount} >= 0`),
    check("proposals_price_non_negative", sql`${table.priceUno} >= 0`),
  ],
);

export const proposalParticipants = mysqlTable(
  "proposal_participants",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    hasPaid: boolean("has_paid").notNull().default(false),
    paymentId: int("payment_id"),
    joinedAt: datetime("joined_at", { fsp: 3 }).notNull().default(now),
    leftAt: datetime("left_at", { fsp: 3 }),
    /**
     * Rang du joueur au classement de la session et mouvement de division
     * qui en découle (RANK-005). Figés à la clôture : le tableau de résultats
     * d'une session passée ne change plus, même si le joueur change de
     * division ensuite.
     */
    sessionRank: int("session_rank"),
    sessionPoints: decimal("session_points", { precision: 7, scale: 1 }),
    movement: mysqlEnum("movement", ["promoted", "relegated", "stayed"]),
    /**
     * Note de la carte avant et après cette session (CARD-002).
     *
     * Deux colonnes plutôt qu'un écart : l'historique affiche la note obtenue,
     * pas seulement le mouvement, et une correction de session retrouve le
     * déplacement exact à annuler sans le recalculer.
     */
    ratingBefore: int("rating_before"),
    ratingAfter: int("rating_after"),
    /**
     * Renseigné lorsque la place a été reprise à un joueur qui n'avait pas
     * réglé dans les temps : l'historique dit qui a cédé sa place.
     */
    replacedPlayerId: int("replaced_player_id"),
  },
  (table) => [
    // CAL-006 : un joueur ne peut jamais être inscrit deux fois.
    uniqueIndex("proposal_participants_unique").on(
      table.proposalId,
      table.playerId,
    ),
    index("proposal_participants_player_idx").on(table.playerId),
  ],
);

// ---------------------------------------------------------------------------
// Remplaçants (CAL-008)
// ---------------------------------------------------------------------------

/**
 * File d'attente d'une réservation.
 *
 * Un joueur non inscrit se déclare remplaçant ; si une place n'est pas réglée
 * dans les 24 heures, il peut la payer et la prendre. Le but est d'éviter
 * qu'une session entière tombe parce qu'un seul joueur n'a pas payé.
 *
 * L'unicité (proposition, joueur) empêche de se déclarer deux fois ; le
 * statut retrace ce qu'il est advenu de la candidature.
 */
export const proposalSubstitutes = mysqlTable(
  "proposal_substitutes",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["waiting", "promoted", "withdrawn"])
      .notNull()
      .default("waiting"),
    /** Place effectivement reprise, une fois le remplacement effectué. */
    replacedPlayerId: int("replaced_player_id"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    promotedAt: datetime("promoted_at", { fsp: 3 }),
  },
  (table) => [
    uniqueIndex("proposal_substitutes_unique").on(
      table.proposalId,
      table.playerId,
    ),
    index("proposal_substitutes_player_idx").on(table.playerId),
    index("proposal_substitutes_queue_idx").on(
      table.proposalId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 30 }).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "initiated",
      "paid",
      "failed",
      "refunded",
    ])
      .notNull()
      .default("pending"),
    /** Montant figé côté serveur d'après la proposition (écart §24). */
    amountUno: int("amount_uno").notNull(),
    amountEurCents: int("amount_eur_cents").notNull(),
    provider: varchar("provider", { length: 30 }),
    /** Identifiant d'intent chez le PSP, jamais de données de carte. */
    providerIntentId: varchar("provider_intent_id", { length: 120 }),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
    paidAt: datetime("paid_at", { fsp: 3 }),
  },
  (table) => [
    // STATE-002 : un double clic ou un retry réseau ne crée qu'un paiement.
    uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("payments_provider_intent_unique").on(table.providerIntentId),
    index("payments_proposal_idx").on(table.proposalId),
    index("payments_player_idx").on(table.playerId),
    check("payments_amount_non_negative", sql`${table.amountUno} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Équipes et matchs
// ---------------------------------------------------------------------------

export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    teamIndex: int("team_index").notNull(),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("teams_proposal_index_unique").on(
      table.proposalId,
      table.teamIndex,
    ),
  ],
);

export const teamMembers = mysqlTable(
  "team_members",
  {
    id: int("id").autoincrement().primaryKey(),
    teamId: int("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("team_members_unique").on(table.teamId, table.playerId),
    index("team_members_player_idx").on(table.playerId),
  ],
);

export const matches = mysqlTable(
  "matches",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    teamAId: int("team_a_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    teamBId: int("team_b_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    scoreA: int("score_a").notNull().default(0),
    scoreB: int("score_b").notNull().default(0),
    /**
     * Rang du match dans la session, à partir de 1.
     *
     * En UNO League les matchs s'enchaînent — le vainqueur reste sur le
     * terrain — et leur nombre n'est pas connu à l'avance. L'ordre ne peut
     * donc plus se déduire de l'identifiant : il est porté explicitement,
     * pour que la feuille de match raconte la session dans le bon sens.
     */
    matchOrder: int("match_order").notNull().default(1),
    status: mysqlEnum("status", [
      "scheduled",
      "live",
      "finished",
      "validated",
      "corrected",
    ])
      .notNull()
      .default("scheduled"),
    playedAt: datetime("played_at", { fsp: 3 }),
    /**
     * Horodatage de validation. MATCH-005 : tant qu'il est nul, aucune
     * statistique n'a été reportée sur les joueurs et aucune récompense
     * distribuée ; une seconde validation est refusée.
     */
    validatedAt: datetime("validated_at", { fsp: 3 }),
    validatedByUserId: int("validated_by_user_id").references(() => users.id),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("matches_proposal_idx").on(table.proposalId),
    // MATCH-003 : un score ne peut jamais être négatif.
    check("matches_score_a_non_negative", sql`${table.scoreA} >= 0`),
    check("matches_score_b_non_negative", sql`${table.scoreB} >= 0`),
  ],
);

export const matchStats = mysqlTable(
  "match_stats",
  {
    id: int("id").autoincrement().primaryKey(),
    matchId: int("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    goals: int("goals").notNull().default(0),
    assists: int("assists").notNull().default(0),
    defenses: int("defenses").notNull().default(0),
    saves: int("saves").notNull().default(0),
    motm: boolean("motm").notNull().default(false),
  },
  (table) => [
    // MATCH-004 : une ligne par joueur et par match, donc pas de double compte.
    uniqueIndex("match_stats_unique").on(table.matchId, table.playerId),
    index("match_stats_player_idx").on(table.playerId),
    check("match_stats_goals_non_negative", sql`${table.goals} >= 0`),
    check("match_stats_assists_non_negative", sql`${table.assists} >= 0`),
    check("match_stats_defenses_non_negative", sql`${table.defenses} >= 0`),
    check("match_stats_saves_non_negative", sql`${table.saves} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Ledger UNO (CDC §11)
// ---------------------------------------------------------------------------

/**
 * Registre financier append-only : aucune ligne n'est jamais modifiée ni
 * supprimée. `balanceAfter` fige le solde du joueur après l'écriture, ce qui
 * permet de rejouer et d'auditer l'historique (WAL-006).
 */
export const transactions = mysqlTable(
  "transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    type: varchar("type", { length: 30 }).notNull(),
    /** Montant signé : négatif pour un débit, positif pour un crédit. */
    amount: int("amount").notNull(),
    balanceAfter: int("balance_after").notNull(),
    fromPlayerId: int("from_player_id"),
    toPlayerId: int("to_player_id"),
    referenceType: varchar("reference_type", { length: 30 }),
    referenceId: int("reference_id"),
    description: varchar("description", { length: 200 }).notNull(),
    /** Empêche en base tout double débit sur retry (STATE-002). */
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("transactions_idempotency_unique").on(table.idempotencyKey),
    index("transactions_player_created_idx").on(table.playerId, table.createdAt),
    check("transactions_balance_non_negative", sql`${table.balanceAfter} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Boutique et commandes (CDC §12)
// ---------------------------------------------------------------------------

export const shopItems = mysqlTable(
  "shop_items",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull(),
    category: mysqlEnum("category", [
      "headphones",
      "watches",
      "shoes",
      "clothes",
      "accessories",
    ]).notNull(),
    priceUno: int("price_uno").notNull(),
    priceEuros: decimal("price_euros", { precision: 10, scale: 2 }),
    productUrl: varchar("product_url", { length: 2048 }),
    /**
     * Première URL = image principale (SHOP-006).
     *
     * Sans valeur par défaut en base : TiDB refuse `DEFAULT ('[]')` sur une
     * colonne JSON, syntaxe que MySQL 8 accepte pourtant. La valeur est
     * fournie à chaque écriture — le schéma de validation la ramène à un
     * tableau vide si elle est absente — donc la contrainte NOT NULL suffit.
     */
    images: json("images").$type<string[]>().notNull(),
    /**
     * Déclinaison du produit : sans taille, tailles de vêtement, ou
     * pointures. Choisi par l'administration produit par produit — la
     * catégorie ne suffit pas à le deviner (SHOP-002).
     */
    sizeKind: mysqlEnum("size_kind", ["none", "clothing", "shoes"])
      .notNull()
      .default("none"),
    /**
     * Sous-ensemble réellement proposé ; vide ou absent = toutes celles du
     * type. Volontairement **nullable** : une colonne JSON ajoutée par
     * `ALTER TABLE` ne peut pas être remplie pour les lignes existantes, et
     * MySQL y laisse silencieusement des NULL malgré un NOT NULL déclaré.
     * Mieux vaut une colonne honnêtement nullable, normalisée à la lecture,
     * qu'une contrainte que la base ne tient pas.
     */
    sizes: json("sizes").$type<string[]>(),
    available: boolean("available").notNull().default(true),
    /**
     * ADMIN-004 : un produit déjà commandé n'est jamais supprimé
     * physiquement, il est archivé pour préserver l'historique.
     */
    archived: boolean("archived").notNull().default(false),
    /** null = stock non géré. */
    stock: int("stock"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("shop_items_category_idx").on(table.category),
    index("shop_items_available_idx").on(table.available, table.archived),
    check("shop_items_price_positive", sql`${table.priceUno} > 0`),
  ],
);

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", [
      "pending",
      "paid",
      "fulfilled",
      "cancelled",
      "refunded",
    ])
      .notNull()
      .default("pending"),
    totalUno: int("total_uno").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    fulfilledAt: datetime("fulfilled_at", { fsp: 3 }),
  },
  (table) => [
    uniqueIndex("orders_idempotency_unique").on(table.idempotencyKey),
    index("orders_player_idx").on(table.playerId, table.createdAt),
    check("orders_total_non_negative", sql`${table.totalUno} >= 0`),
  ],
);

export const orderItems = mysqlTable(
  "order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** null si le produit a été supprimé après la commande (ADMIN-004). */
    shopItemId: int("shop_item_id").references(() => shopItems.id, {
      onDelete: "set null",
    }),
    /** Nom figé au moment de l'achat : l'historique reste lisible. */
    productNameSnapshot: varchar("product_name_snapshot", {
      length: 120,
    }).notNull(),
    unitPriceUno: int("unit_price_uno").notNull(),
    quantity: int("quantity").notNull(),
    totalUno: int("total_uno").notNull(),
    /** Taille ou pointure choisie ; null pour un article en taille unique. */
    size: varchar("size", { length: 10 }),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

/**
 * Avis produits (SHOP-002).
 *
 * Un joueur, un avis par produit : l'unicité en base rend impossible le
 * gonflage d'une note par publications répétées. Modifier son avis réécrit la
 * ligne existante plutôt que d'en ajouter une.
 */
export const productReviews = mysqlTable(
  "product_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    shopItemId: int("shop_item_id")
      .notNull()
      .references(() => shopItems.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    rating: int("rating").notNull(),
    comment: text("comment"),
    /** Vrai si le joueur a déjà commandé l'article : « achat vérifié ». */
    verifiedPurchase: boolean("verified_purchase").notNull().default(false),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("product_reviews_unique").on(table.shopItemId, table.playerId),
    index("product_reviews_item_idx").on(table.shopItemId, table.createdAt),
    check("product_reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

/**
 * Flux d'évènements destiné à l'administration (ADMIN-006).
 *
 * Chaque fait marquant du domaine — réservation, session, paiement, commande,
 * transfert, avis — y dépose une ligne. Le tableau de bord le lit tel quel :
 * l'administration n'a plus à parcourir cinq écrans pour savoir ce qui s'est
 * passé depuis hier.
 *
 * `eventKey` est unique : un traitement rejoué (retry réseau, webhook doublé)
 * ne produit jamais deux fois la même notification. Distinct du journal
 * d'audit, qui trace *qui a fait quoi* à des fins de responsabilité, alors
 * qu'ici on trace *ce qui est arrivé* à des fins d'exploitation.
 */
export const adminEvents = mysqlTable(
  "admin_events",
  {
    id: int("id").autoincrement().primaryKey(),
    type: varchar("type", { length: 40 }).notNull(),
    category: mysqlEnum("category", [
      "calendar",
      "payment",
      "shop",
      "wallet",
    ]).notNull(),
    title: varchar("title", { length: 140 }).notNull(),
    body: varchar("body", { length: 300 }).notNull(),
    /** Entité concernée, pour ouvrir l'écran correspondant d'un clic. */
    entityType: varchar("entity_type", { length: 40 }),
    entityId: int("entity_id"),
    /** Joueur à l'origine de l'évènement, quand il y en a un. */
    playerId: int("player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    eventKey: varchar("event_key", { length: 120 }).notNull(),
    readAt: datetime("read_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("admin_events_key_unique").on(table.eventKey),
    index("admin_events_created_idx").on(table.createdAt),
    index("admin_events_unread_idx").on(table.readAt, table.createdAt),
    index("admin_events_category_idx").on(table.category, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Annonces et notifications (CDC §14)
// ---------------------------------------------------------------------------

export const announcements = mysqlTable(
  "announcements",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["info", "alert", "reward", "maintenance"])
      .notNull()
      .default("info"),
    title: varchar("title", { length: 120 }).notNull(),
    content: text("content").notNull(),
    status: mysqlEnum("status", ["draft", "published", "expired", "archived"])
      .notNull()
      .default("draft"),
    publishedAt: datetime("published_at", { fsp: 3 }),
    expiresAt: datetime("expires_at", { fsp: 3 }),
    /** null = toutes divisions. */
    targetDivision: mysqlEnum("target_division", ["D1", "D2", "D3"]),
    targetRole: mysqlEnum("target_role", ["user", "admin"]),
    createdByUserId: int("created_by_user_id").references(() => users.id),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("announcements_published_idx").on(table.status, table.publishedAt),
  ],
);

export const announcementReads = mysqlTable(
  "announcement_reads",
  {
    id: int("id").autoincrement().primaryKey(),
    announcementId: int("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    readAt: datetime("read_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("announcement_reads_unique").on(
      table.announcementId,
      table.playerId,
    ),
  ],
);

export const deviceTokens = mysqlTable(
  "device_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    platform: mysqlEnum("platform", ["ios", "android", "web"]).notNull(),
    pushToken: varchar("push_token", { length: 512 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastSeenAt: datetime("last_seen_at", { fsp: 3 }).notNull().default(now),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("device_tokens_token_unique").on(table.pushToken),
    index("device_tokens_player_idx").on(table.playerId),
  ],
);

/**
 * Journal des notifications déjà envoyées (ANN-004).
 * `eventKey` identifie l'évènement métier ; l'unicité (joueur, évènement)
 * garantit qu'un retry ne produit jamais de doublon visible.
 */
export const notificationDeliveries = mysqlTable(
  "notification_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 120 }).notNull(),
    channel: mysqlEnum("channel", ["push", "inapp"]).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: varchar("body", { length: 300 }).notNull(),
    readAt: datetime("read_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("notification_deliveries_unique").on(
      table.playerId,
      table.eventKey,
      table.channel,
    ),
    index("notification_deliveries_player_idx").on(
      table.playerId,
      table.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Audit (ADMIN-005)
// ---------------------------------------------------------------------------

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 60 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: int("entity_id"),
    beforeJson: json("before_json"),
    afterJson: json("after_json"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_actor_idx").on(table.actorUserId, table.createdAt),
  ],
);

/**
 * Vidéos d'une session (SUP-002).
 *
 * Ce sont des **liens**, jamais des fichiers : deux heures de futsal filmées
 * au téléphone pèsent plusieurs gigaoctets, que ni l'API ni le forfait mobile
 * du superviseur n'ont à porter. La vidéo vit là où elle a été déposée —
 * YouTube en non répertorié, Vimeo, un partage de fichiers — et l'application
 * n'en garde que l'adresse.
 *
 * Plusieurs par session : une séance de deux heures tient rarement en une
 * seule prise.
 */
export const sessionVideos = mysqlTable(
  "session_videos",
  {
    id: int("id").autoincrement().primaryKey(),
    proposalId: int("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 2048 }).notNull(),
    /** Étiquette libre : « 1re heure », « second match », … */
    label: varchar("label", { length: 80 }),
    /**
     * Hébergeur reconnu, déterminé par le serveur à partir de l'adresse.
     * Il décide de ce qui peut être joué dans un cadre intégré : seuls
     * `youtube` et `vimeo` le sont, tout le reste reste un lien ordinaire.
     */
    provider: mysqlEnum("provider", ["youtube", "vimeo", "other"])
      .notNull()
      .default("other"),
    addedByPlayerId: int("added_by_player_id").references(() => players.id),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("session_videos_proposal_idx").on(table.proposalId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Saisie en visionnage (TRACK-001)
// ---------------------------------------------------------------------------

/**
 * Feuille de saisie d'une session.
 *
 * Volontairement séparée de `proposals` : une feuille se crée en dix secondes,
 * sans réservation, sans paiement et sans inscription, parce que son seul
 * objet est de relever ce qui s'est passé sur le terrain. La réservation reste
 * la source de vérité commerciale ; la feuille est la source de vérité
 * sportive, et la publication fait le pont entre les deux.
 *
 * Une feuille peut néanmoins être rattachée à une session réservée
 * (`proposal_id`) : c'est le cas normal d'une session jouée et payée dans
 * l'application, dont on saisit les statistiques après coup.
 */
export const statSessions = mysqlTable(
  "stat_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 80 }).notNull(),
    localDate: varchar("local_date", { length: 10 }).notNull(),
    /** Heure de début du créneau, pour que la session publiée s'affiche à sa place. */
    slotStartHour: int("slot_start_hour").notNull().default(20),
    venueId: varchar("venue_id", { length: 40 }),
    venueName: varchar("venue_name", { length: 80 }),
    modeId: varchar("mode_id", { length: 20 }).notNull().default("league"),
    division: mysqlEnum("division", ["D1", "D2", "D3"]),
    status: mysqlEnum("status", ["draft", "published"])
      .notNull()
      .default("draft"),
    /** Session réservée dont cette feuille relève les statistiques. */
    proposalId: int("proposal_id").references(() => proposals.id, {
      onDelete: "set null",
    }),
    /** Session vers laquelle la feuille a été publiée. */
    publishedProposalId: int("published_proposal_id").references(
      () => proposals.id,
      { onDelete: "set null" },
    ),
    publishedAt: datetime("published_at", { fsp: 3 }),
    createdByUserId: int("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("stat_sessions_date_idx").on(table.localDate),
    index("stat_sessions_status_idx").on(table.status),
  ],
);

export const statTeams = mysqlTable(
  "stat_teams",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id")
      .notNull()
      .references(() => statSessions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    /** Couleur de chasuble : c'est à elle qu'on reconnaît une équipe en vidéo. */
    color: varchar("color", { length: 9 }).notNull(),
    teamIndex: int("team_index").notNull(),
  },
  (table) => [
    uniqueIndex("stat_teams_session_index_unique").on(
      table.sessionId,
      table.teamIndex,
    ),
  ],
);

/**
 * Un joueur sur la feuille.
 *
 * `player_id` nul désigne un invité : un nom saisi à la volée pour ne pas
 * interrompre le visionnage. Ses actions sont relevées comme les autres, mais
 * la publication exige qu'il ait été rattaché à un compte — sinon ses points
 * n'iraient nulle part.
 */
export const statParticipants = mysqlTable(
  "stat_participants",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id")
      .notNull()
      .references(() => statSessions.id, { onDelete: "cascade" }),
    teamId: int("team_id")
      .notNull()
      .references(() => statTeams.id, { onDelete: "cascade" }),
    playerId: int("player_id").references(() => players.id, {
      onDelete: "cascade",
    }),
    guestName: varchar("guest_name", { length: 40 }),
    shirtNumber: int("shirt_number"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    // Un joueur inscrit ne peut pas figurer deux fois sur la même feuille :
    // deux lignes pour une seule personne dédoubleraient ses statistiques.
    uniqueIndex("stat_participants_session_player_unique").on(
      table.sessionId,
      table.playerId,
    ),
    index("stat_participants_team_idx").on(table.teamId),
  ],
);

/**
 * Enregistrements d'une feuille de saisie (TRACK-001).
 *
 * Une séance de deux heures est rarement filmée d'une traite : deux ou trois
 * fichiers, parfois une prise par mi-temps. La feuille porte donc une liste,
 * pas une vidéo.
 *
 * `url` peut être nulle, et c'est le cas courant : un fichier ouvert depuis le
 * disque ne passe jamais par le serveur, il n'a pas d'adresse. L'entrée sert
 * alors de **repère nommé** — « 1re heure » — que l'on ré-associe à son fichier
 * à chaque visite. C'est ce repère, et non le fichier, qui permet à un match
 * de dire dans quel enregistrement se trouve son coup d'envoi.
 */
export const statSessionVideos = mysqlTable(
  "stat_session_videos",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id")
      .notNull()
      .references(() => statSessions.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }).notNull(),
    /** Adresse si la vidéo est hébergée ; nulle pour un fichier local. */
    url: varchar("url", { length: 2048 }),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    index("stat_session_videos_session_idx").on(table.sessionId, table.sortOrder),
  ],
);

export const statMatches = mysqlTable(
  "stat_matches",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("session_id")
      .notNull()
      .references(() => statSessions.id, { onDelete: "cascade" }),
    matchOrder: int("match_order").notNull(),
    teamAId: int("team_a_id")
      .notNull()
      .references(() => statTeams.id, { onDelete: "cascade" }),
    teamBId: int("team_b_id")
      .notNull()
      .references(() => statTeams.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pending", "playing", "finished"])
      .notNull()
      .default("pending"),
    /**
     * Position du coup d'envoi dans l'enregistrement. Posée une fois par
     * match : toute action saisie ensuite connaît sa minute de jeu sans que
     * personne n'ait à la calculer.
     */
    videoStartMs: int("video_start_ms"),
    /**
     * Enregistrement dans lequel ce coup d'envoi a été relevé.
     *
     * Sans lui, `videoStartMs` serait ambigu dès qu'une feuille compte deux
     * vidéos : rouvrir une action de la seconde heure chercherait sa position
     * dans la première.
     */
    videoId: int("video_id").references(() => statSessionVideos.id, {
      onDelete: "set null",
    }),
    /**
     * Score relevé sur la vidéo. Il ne sert pas à établir le résultat — celui-ci
     * se déduit des buteurs — mais à le contrôler : un écart signale un but
     * manqué ou compté deux fois.
     */
    declaredScoreA: int("declared_score_a"),
    declaredScoreB: int("declared_score_b"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("stat_matches_session_order_unique").on(
      table.sessionId,
      table.matchOrder,
    ),
  ],
);

/**
 * Une action saisie.
 *
 * `client_id` est produit par l'appareil de saisie et unique en base : c'est
 * lui, et non le code applicatif, qui rend la synchronisation rejouable. Une
 * file d'attente hors ligne renvoyée deux fois — reprise de réseau, onglet
 * rouvert, double clic — n'écrit qu'une seule ligne.
 *
 * `team_id` est figé au moment de l'action. Un joueur déplacé d'une équipe à
 * l'autre entre deux matchs — cas normal en cours de séance — ne réécrit donc
 * pas l'histoire des matchs déjà saisis.
 */
export const statEvents = mysqlTable(
  "stat_events",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: varchar("client_id", { length: 64 }).notNull(),
    matchId: int("match_id")
      .notNull()
      .references(() => statMatches.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", [
      "goal",
      "own_goal",
      "defense",
      "save",
      "gk_in",
    ]).notNull(),
    participantId: int("participant_id")
      .notNull()
      .references(() => statParticipants.id, { onDelete: "cascade" }),
    assistParticipantId: int("assist_participant_id").references(
      () => statParticipants.id,
      { onDelete: "set null" },
    ),
    teamId: int("team_id")
      .notNull()
      .references(() => statTeams.id, { onDelete: "cascade" }),
    clockMs: int("clock_ms").notNull().default(0),
    videoMs: int("video_ms"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("stat_events_client_id_unique").on(table.clientId),
    index("stat_events_match_idx").on(table.matchId, table.clockMs),
    check("stat_events_clock_non_negative", sql`${table.clockMs} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Types inférés
// ---------------------------------------------------------------------------

export type UserRow = typeof users.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type ProposalRow = typeof proposals.$inferSelect;
export type ParticipantRow = typeof proposalParticipants.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type ShopItemRow = typeof shopItems.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type SeasonRow = typeof seasons.$inferSelect;
export type VenueRow = typeof venues.$inferSelect;
export type SubstituteRow = typeof proposalSubstitutes.$inferSelect;
export type ProductReviewRow = typeof productReviews.$inferSelect;
export type AdminEventRow = typeof adminEvents.$inferSelect;
export type SessionVideoRow = typeof sessionVideos.$inferSelect;
export type StatSessionRow = typeof statSessions.$inferSelect;
export type StatTeamRow = typeof statTeams.$inferSelect;
export type StatParticipantRow = typeof statParticipants.$inferSelect;
export type StatMatchRow = typeof statMatches.$inferSelect;
export type StatSessionVideoRow = typeof statSessionVideos.$inferSelect;
export type StatEventRow = typeof statEvents.$inferSelect;

// ---------------------------------------------------------------------------
// Mode SQUAD (SQUAD-001)
// ---------------------------------------------------------------------------

/**
 * Une équipe permanente, à la manière d'un club.
 *
 * **Trésorerie portée par la ligne du SQUAD**, et non par une table séparée
 * comme le suggérait la spécification. C'est le choix déjà fait pour le
 * portefeuille d'un joueur — `players.uno_points` avec `transactions` pour
 * registre — et le répliquer garde un seul modèle financier dans
 * l'application plutôt que deux qui se ressemblent. Le registre
 * `squad_treasury_transactions` porte l'auditabilité.
 *
 * `treasury_locked` tient les UNO engagés dans un défi ou un transfert en
 * cours : ils appartiennent encore au SQUAD mais ne peuvent plus être
 * dépensés ailleurs. La somme disponible + verrouillée est le total affiché.
 */
export const squads = mysqlTable(
  "squads",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 40 }).notNull(),
    /** Identifiant lisible et stable, utilisé dans les adresses. */
    slug: varchar("slug", { length: 40 }).notNull(),
    description: varchar("description", { length: 500 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    /**
     * Fondateur courant. `restrict` et non `cascade` : supprimer un joueur ne
     * doit jamais faire disparaître un club et son histoire de matchs.
     */
    founderPlayerId: int("founder_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),

    /** Cote de type Elo, indépendante des mises (SQUAD-007). */
    rating: int("rating").notNull().default(SQUAD_RATING_INITIAL),
    matchesPlayed: int("matches_played").notNull().default(0),
    wins: int("wins").notNull().default(0),
    losses: int("losses").notNull().default(0),
    draws: int("draws").notNull().default(0),
    /** Série en cours : positive pour des victoires, négative pour des défaites. */
    streak: int("streak").notNull().default(0),
    totalUnoWon: int("total_uno_won").notNull().default(0),

    treasuryAvailable: int("treasury_available").notNull().default(0),
    treasuryLocked: int("treasury_locked").notNull().default(0),

    /** Un club dissous garde son histoire ; il ne recrute plus. */
    status: mysqlEnum("status", ["active", "dissolved"]).notNull().default("active"),

    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("squads_name_unique").on(table.name),
    uniqueIndex("squads_slug_unique").on(table.slug),
    index("squads_rating_idx").on(table.rating),
    // DATA-002 : une trésorerie ne peut pas devenir négative, ni par un
    // débit concurrent ni par une erreur de calcul.
    check("squads_treasury_non_negative", sql`${table.treasuryAvailable} >= 0`),
    check("squads_locked_non_negative", sql`${table.treasuryLocked} >= 0`),
    check("squads_rating_non_negative", sql`${table.rating} >= 0`),
  ],
);

/**
 * Appartenance d'un joueur à un SQUAD, présente et passée.
 *
 * **Un joueur n'a qu'une affiliation active, et c'est la base qui le tient.**
 * La spécification l'exige au niveau serveur (AC02) ; un contrôle applicatif
 * ne suffirait pas, deux requêtes simultanées pouvant le franchir toutes les
 * deux. La colonne générée `active_player_id` vaut l'identifiant du joueur
 * tant que la ligne est active, et `NULL` ensuite — or MySQL n'oppose pas
 * deux `NULL` dans un index unique. Un joueur peut donc accumuler les
 * passages dans des clubs, mais jamais deux en même temps.
 *
 * Les lignes closes ne sont pas supprimées : l'historique des transferts et
 * des compositions s'y adosse.
 *
 * **Les clés étrangères sont en `restrict`, et pas seulement par choix.**
 * MySQL refuse une action en cascade sur une colonne dont dépend une colonne
 * générée — ici `player_id`, base de `active_player_id`. La contrainte
 * technique rejoint l'intention : un club dissous ou un compte fermé ne doit
 * pas emporter l'historique des matchs qui s'y rattachent. Un SQUAD se
 * retire par son statut `dissolved`, jamais par une suppression.
 */
export const squadMembers = mysqlTable(
  "squad_members",
  {
    id: int("id").autoincrement().primaryKey(),
    squadId: int("squad_id")
      .notNull()
      .references(() => squads.id, { onDelete: "restrict" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    role: mysqlEnum("role", ["founder", "captain", "member"])
      .notNull()
      .default("member"),
    status: mysqlEnum("status", ["active", "left", "removed"])
      .notNull()
      .default("active"),
    joinedAt: datetime("joined_at", { fsp: 3 }).notNull().default(now),
    leftAt: datetime("left_at", { fsp: 3 }),
    activePlayerId: int("active_player_id").generatedAlwaysAs(
      sql`(CASE WHEN \`status\` = 'active' THEN \`player_id\` END)`,
      { mode: "stored" },
    ),
  },
  (table) => [
    uniqueIndex("squad_members_one_active_unique").on(table.activePlayerId),
    index("squad_members_squad_idx").on(table.squadId, table.status),
    index("squad_members_player_idx").on(table.playerId),
  ],
);

/**
 * Demande d'adhésion à un SQUAD (SQUAD-002).
 *
 * Même procédé que pour l'appartenance : une seule demande en attente par
 * couple (club, joueur), tenue par une colonne générée. Sans cela, un joueur
 * impatient empilerait les demandes dans la file du fondateur.
 */
export const squadJoinRequests = mysqlTable(
  "squad_join_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    squadId: int("squad_id")
      .notNull()
      .references(() => squads.id, { onDelete: "restrict" }),
    playerId: int("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    message: varchar("message", { length: 500 }),
    status: mysqlEnum("status", ["pending", "accepted", "rejected", "cancelled"])
      .notNull()
      .default("pending"),
    decidedByPlayerId: int("decided_by_player_id"),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
    decidedAt: datetime("decided_at", { fsp: 3 }),
    pendingSquadId: int("pending_squad_id").generatedAlwaysAs(
      sql`(CASE WHEN \`status\` = 'pending' THEN \`squad_id\` END)`,
      { mode: "stored" },
    ),
    pendingPlayerId: int("pending_player_id").generatedAlwaysAs(
      sql`(CASE WHEN \`status\` = 'pending' THEN \`player_id\` END)`,
      { mode: "stored" },
    ),
  },
  (table) => [
    uniqueIndex("squad_join_requests_pending_unique").on(
      table.pendingSquadId,
      table.pendingPlayerId,
    ),
    index("squad_join_requests_squad_idx").on(table.squadId, table.status),
    index("squad_join_requests_player_idx").on(table.playerId, table.status),
  ],
);

/**
 * Registre de la trésorerie d'un SQUAD (SQUAD-003).
 *
 * Calqué sur `transactions`, le registre des portefeuilles personnels : même
 * montant signé, même solde après opération, même clé d'idempotence. Un seul
 * modèle financier dans l'application, appliqué deux fois.
 *
 * `locked_after` s'ajoute : une mise verrouillée ne change pas le total
 * possédé par le club, seulement sa part disponible. Sans cette colonne, le
 * registre ne permettrait pas de reconstituer l'état d'un séquestre.
 *
 * Le registre est immuable : aucune ligne n'est modifiée ni supprimée. Une
 * correction s'écrit en sens inverse.
 */
export const squadTreasuryTransactions = mysqlTable(
  "squad_treasury_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    squadId: int("squad_id")
      .notNull()
      .references(() => squads.id, { onDelete: "restrict" }),
    /** Le membre à l'origine de l'opération, quand il y en a un. */
    playerId: int("player_id"),
    type: varchar("type", { length: 30 }).notNull(),
    /** Montant signé : négatif pour une sortie, positif pour une entrée. */
    amount: int("amount").notNull(),
    availableAfter: int("available_after").notNull(),
    lockedAfter: int("locked_after").notNull(),
    referenceType: varchar("reference_type", { length: 30 }),
    referenceId: int("reference_id"),
    description: varchar("description", { length: 200 }).notNull(),
    /** Empêche en base tout double mouvement sur réessai (STATE-002). */
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("squad_treasury_idempotency_unique").on(table.idempotencyKey),
    index("squad_treasury_squad_created_idx").on(table.squadId, table.createdAt),
    check("squad_treasury_available_non_negative", sql`${table.availableAfter} >= 0`),
    check("squad_treasury_locked_non_negative", sql`${table.lockedAfter} >= 0`),
  ],
);

export type SquadRow = typeof squads.$inferSelect;
export type SquadMemberRow = typeof squadMembers.$inferSelect;
export type SquadJoinRequestRow = typeof squadJoinRequests.$inferSelect;
export type SquadTreasuryTransactionRow =
  typeof squadTreasuryTransactions.$inferSelect;
