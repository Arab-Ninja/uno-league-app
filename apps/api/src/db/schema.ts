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
    division: mysqlEnum("division", ["D1", "D2", "D3"])
      .notNull()
      .default("D3"),
    unoPoints: int("uno_points").notNull().default(0),
    xp: int("xp").notNull().default(0),
    level: int("level").notNull().default(1),
    goals: int("goals").notNull().default(0),
    assists: int("assists").notNull().default(0),
    defenses: int("defenses").notNull().default(0),
    saves: int("saves").notNull().default(0),
    motm: int("motm").notNull().default(0),
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
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
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
