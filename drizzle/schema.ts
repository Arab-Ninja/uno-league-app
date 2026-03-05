import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns a Unix-epoch integer column that defaults to now (SQLite-compatible). */
const now = () => integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull();
const updatedAt = () =>
  integer("updatedAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull();

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  /** 'user' | 'admin' */
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Player / joueur profile linked to a user account.
 * Champs: id / prénom / nom / date de naissance / email / photo_profil / adresse /
 *         Balance UNO / Division / Stats globales / Stats buts / passes D / défenses / arrêts / MOTM
 */
export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Manus OAuth openId (or local email) used as unique key. */
  openId: text("openId").notNull().unique(),
  firstName: text("firstName"),
  lastName: text("lastName"),
  /** Full display name derived from firstName + lastName (or set directly). */
  name: text("name").notNull(),
  email: text("email"),
  address: text("address"),
  /** D1 | D2 | D3 */
  division: text("division", { enum: ["D1", "D2", "D3"] }).default("D3").notNull(),
  unoPoints: integer("unoPoints").default(1000).notNull(),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  /** Cumulative career goals. */
  statsGoals: integer("statsGoals").default(0).notNull(),
  statsAssists: integer("statsAssists").default(0).notNull(),
  statsDefenses: integer("statsDefenses").default(0).notNull(),
  statsSaves: integer("statsSaves").default(0).notNull(),
  statsMotm: integer("statsMotm").default(0).notNull(),
  avatar: text("avatar"),
  nationality: text("nationality"),
  dateOfBirth: text("dateOfBirth"),
  profilePhoto: text("profilePhoto"),
  createdAt: now(),
  updatedAt: updatedAt(),
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;

/**
 * Teams / Équipes.
 * Champs: id / mode de jeu / nom d'équipe / joueurs (JSON list of openIds) / matchs / scores
 */
export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** 'friendly' | 'league' */
  modeId: text("modeId").notNull(),
  name: text("name").notNull(),
  /** JSON-encoded array of player openIds. */
  playerOpenIds: text("playerOpenIds").default("[]").notNull(),
  createdAt: now(),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

/**
 * Matches / Matchs.
 * Champs: id / mode de jeu / équipes / joueurs / scores / statistiques
 */
export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modeId: text("modeId").notNull(),
  /** FK → sessions.id (nullable if standalone match) */
  sessionId: integer("sessionId"),
  teamAId: integer("teamAId"),
  teamBId: integer("teamBId"),
  /** Team A name (snapshot) */
  teamAName: text("teamAName"),
  /** Team B name (snapshot) */
  teamBName: text("teamBName"),
  scoreA: integer("scoreA").default(0).notNull(),
  scoreB: integer("scoreB").default(0).notNull(),
  /** JSON-encoded match statistics. */
  statistics: text("statistics").default("{}").notNull(),
  playedAt: integer("playedAt", { mode: "timestamp" }),
  createdAt: now(),
});

export type Match = typeof matches.$inferSelect;
export type InsertMatch = typeof matches.$inferInsert;

/**
 * Proposals → Reservations → Sessions (shared table, differentiated by status).
 *
 * Life-cycle:
 *   proposition  – created, waiting for players
 *   reservation  – enough players joined (terrain reserved)
 *   session      – all players paid, match played
 *
 * Champs (Propositions): id / mode de jeu / lieu / date / heure / participants / complet?
 * Champs (Réservations): id / mode de jeu / lieu / date / heure / participants / paiementscomplets?
 * Champs (Sessions):     id / mode de jeu / lieu / date / heure / participants / Équipes / Matchs / Scores
 */
export const proposals = sqliteTable("proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date", { mode: "timestamp" }).notNull(),
  time: text("time").notNull(),
  locationId: text("locationId").notNull(),
  locationName: text("locationName").notNull(),
  locationColor: text("locationColor").default("#334155").notNull(),
  modeId: text("modeId").notNull(),
  modeName: text("modeName").notNull(),
  minParticipants: integer("minParticipants").notNull(),
  price: integer("price").notNull(),
  rewards: text("rewards").notNull(),
  /** 'proposition' | 'reservation' | 'session' */
  status: text("status", { enum: ["proposition", "reservation", "session"] })
    .default("proposition")
    .notNull(),
  /** D1 | D2 | D3 */
  division: text("division", { enum: ["D1", "D2", "D3"] }).default("D3").notNull(),
  /** Whether terrain payment is fully complete (reservation stage). */
  paymentComplete: integer("paymentComplete", { mode: "boolean" }).default(false).notNull(),
  /** JSON array of team ids for the session stage. */
  teamIds: text("teamIds").default("[]").notNull(),
  createdByOpenId: text("createdByOpenId"),
  createdAt: now(),
  updatedAt: updatedAt(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

/**
 * Participants in a proposal / reservation / session.
 */
export const proposalParticipants = sqliteTable("proposalParticipants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proposalId: integer("proposalId").notNull(),
  playerOpenId: text("playerOpenId").notNull(),
  playerName: text("playerName").notNull(),
  hasPaid: integer("hasPaid", { mode: "boolean" }).default(false).notNull(),
  joinedAt: integer("joinedAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type ProposalParticipant = typeof proposalParticipants.$inferSelect;
export type InsertProposalParticipant = typeof proposalParticipants.$inferInsert;

/**
 * Webshop products.
 * Champs: id / produit / images / description / URL_produit / prix_UNO / prix_euros / disponible?
 */
export const shopItems = sqliteTable("shopItems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** JSON-encoded array of image URLs. */
  images: text("images").default("[]").notNull(),
  description: text("description"),
  productUrl: text("productUrl"),
  priceUno: integer("priceUno").notNull(),
  priceEuros: real("priceEuros"),
  available: integer("available", { mode: "boolean" }).default(true).notNull(),
  /** 'headphones' | 'watches' | 'shoes' | 'clothes' | 'accessories' | 'other' */
  category: text("category"),
  createdAt: now(),
});

export type ShopItem = typeof shopItems.$inferSelect;
export type InsertShopItem = typeof shopItems.$inferInsert;

/**
 * UNO points transactions.
 */
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerOpenId: text("playerOpenId").notNull(),
  /** 'send' | 'receive' | 'purchase' | 'reward' */
  type: text("type", { enum: ["send", "receive", "purchase", "reward"] }).notNull(),
  amount: integer("amount").notNull(),
  fromPlayerOpenId: text("fromPlayerOpenId"),
  toPlayerOpenId: text("toPlayerOpenId"),
  description: text("description").notNull(),
  createdAt: now(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

