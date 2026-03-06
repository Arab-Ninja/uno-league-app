import { int, varchar, mysqlTable, text, timestamp, boolean, decimal, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns a timestamp column that defaults to now (MySQL-compatible). */
const now = () => timestamp("createdAt").defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt").defaultNow().onUpdateNow().notNull();

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 100 }),
  /** 'user' | 'admin' */
  role: varchar("role", { length: 50, enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: now(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Player / joueur profile linked to a user account.
 * Champs: id / prénom / nom / date de naissance / email / photo_profil / adresse /
 *         Balance UNO / Division / Stats globales / Stats buts / passes D / défenses / arrêts / MOTM
 */
export const players = mysqlTable("players", {
  id: int("id").primaryKey().autoincrement(),
  /** Manus OAuth openId (or local email) used as unique key. */
  openId: varchar("openId", { length: 255 }).notNull().unique(),
  firstName: varchar("firstName", { length: 255 }),
  lastName: varchar("lastName", { length: 255 }),
  /** Full display name derived from firstName + lastName (or set directly). */
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  address: varchar("address", { length: 255 }),
  /** D1 | D2 | D3 */
  division: varchar("division", { length: 10, enum: ["D1", "D2", "D3"] }).default("D3").notNull(),
  unoPoints: int("unoPoints").default(1000).notNull(),
  xp: int("xp").default(0).notNull(),
  level: int("level").default(1).notNull(),
  /** Cumulative career goals. */
  statsGoals: int("statsGoals").default(0).notNull(),
  statsAssists: int("statsAssists").default(0).notNull(),
  statsDefenses: int("statsDefenses").default(0).notNull(),
  statsSaves: int("statsSaves").default(0).notNull(),
  statsMotm: int("statsMotm").default(0).notNull(),
  avatar: varchar("avatar", { length: 255 }),
  nationality: varchar("nationality", { length: 255 }),
  dateOfBirth: varchar("dateOfBirth", { length: 50 }),
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
export const teams = mysqlTable("teams", {
  id: int("id").primaryKey().autoincrement(),
  /** 'friendly' | 'league' */
  modeId: varchar("modeId", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
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
export const matches = mysqlTable("matches", {
  id: int("id").primaryKey().autoincrement(),
  modeId: varchar("modeId", { length: 100 }).notNull(),
  /** FK → sessions.id (nullable if standalone match) */
  sessionId: int("sessionId"),
  teamAId: int("teamAId"),
  teamBId: int("teamBId"),
  /** Team A name (snapshot) */
  teamAName: varchar("teamAName", { length: 255 }),
  /** Team B name (snapshot) */
  teamBName: varchar("teamBName", { length: 255 }),
  scoreA: int("scoreA").default(0).notNull(),
  scoreB: int("scoreB").default(0).notNull(),
  /** JSON-encoded match statistics. */
  statistics: text("statistics").default("{}").notNull(),
  playedAt: timestamp("playedAt"),
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
export const proposals = mysqlTable("proposals", {
  id: int("id").primaryKey().autoincrement(),
  date: timestamp("date").notNull(),
  time: varchar("time", { length: 50 }).notNull(),
  locationId: varchar("locationId", { length: 100 }).notNull(),
  locationName: varchar("locationName", { length: 255 }).notNull(),
  locationColor: varchar("locationColor", { length: 50 }).default("#334155").notNull(),
  modeId: varchar("modeId", { length: 100 }).notNull(),
  modeName: varchar("modeName", { length: 255 }).notNull(),
  minParticipants: int("minParticipants").notNull(),
  price: int("price").notNull(),
  rewards: text("rewards").notNull(),
  /** 'proposition' | 'reservation' | 'session' */
  status: varchar("status", { length: 50, enum: ["proposition", "reservation", "session"] })
    .default("proposition")
    .notNull(),
  /** D1 | D2 | D3 */
  division: varchar("division", { length: 10, enum: ["D1", "D2", "D3"] }).default("D3").notNull(),
  /** Whether terrain payment is fully complete (reservation stage). */
  paymentComplete: boolean("paymentComplete").default(false).notNull(),
  /** JSON array of team ids for the session stage. */
  teamIds: text("teamIds").default("[]").notNull(),
  createdByOpenId: varchar("createdByOpenId", { length: 255 }),
  createdAt: now(),
  updatedAt: updatedAt(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

/**
 * Participants in a proposal / reservation / session.
 */
export const proposalParticipants = mysqlTable("proposalParticipants", {
  id: int("id").primaryKey().autoincrement(),
  proposalId: int("proposalId").notNull(),
  playerOpenId: varchar("playerOpenId", { length: 255 }).notNull(),
  playerName: varchar("playerName", { length: 255 }).notNull(),
  hasPaid: boolean("hasPaid").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type ProposalParticipant = typeof proposalParticipants.$inferSelect;
export type InsertProposalParticipant = typeof proposalParticipants.$inferInsert;

/**
 * Webshop products.
 * Champs: id / produit / images / description / URL_produit / prix_UNO / prix_euros / disponible?
 */
export const shopItems = mysqlTable("shopItems", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  /** JSON-encoded array of image URLs. */
  images: text("images").default("[]").notNull(),
  description: text("description"),
  productUrl: varchar("productUrl", { length: 500 }),
  priceUno: int("priceUno").notNull(),
  priceEuros: decimal("priceEuros", { precision: 10, scale: 2 }),
  available: boolean("available").default(true).notNull(),
  /** 'headphones' | 'watches' | 'shoes' | 'clothes' | 'accessories' | 'other' */
  category: varchar("category", { length: 100 }),
  createdAt: now(),
});

export type ShopItem = typeof shopItems.$inferSelect;
export type InsertShopItem = typeof shopItems.$inferInsert;

/**
 * UNO points transactions.
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").primaryKey().autoincrement(),
  playerOpenId: varchar("playerOpenId", { length: 255 }).notNull(),
  /** 'send' | 'receive' | 'purchase' | 'reward' */
  type: varchar("type", { length: 50, enum: ["send", "receive", "purchase", "reward"] }).notNull(),
  amount: int("amount").notNull(),
  fromPlayerOpenId: varchar("fromPlayerOpenId", { length: 255 }),
  toPlayerOpenId: varchar("toPlayerOpenId", { length: 255 }),
  description: varchar("description", { length: 500 }).notNull(),
  createdAt: now(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
