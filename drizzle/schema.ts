import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Player profile linked to a user account.
 * Stores UNO League-specific player data (stats, points, division).
 */
export const players = mysqlTable("players", {
  id: int("id").autoincrement().primaryKey(),
  /** References users.openId (the mock auth uses openId = email for local accounts). */
  openId: varchar("openId", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  division: mysqlEnum("division", ["D1", "D2", "D3"]).default("D3").notNull(),
  unoPoints: int("unoPoints").default(1000).notNull(),
  xp: int("xp").default(0).notNull(),
  level: int("level").default(1).notNull(),
  goals: int("goals").default(0).notNull(),
  assists: int("assists").default(0).notNull(),
  defenses: int("defenses").default(0).notNull(),
  saves: int("saves").default(0).notNull(),
  motm: int("motm").default(0).notNull(),
  avatar: varchar("avatar", { length: 16 }),
  nationality: varchar("nationality", { length: 64 }),
  dateOfBirth: varchar("dateOfBirth", { length: 32 }),
  profilePhoto: text("profilePhoto"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;

/**
 * Match proposals created by players.
 * Life-cycle: proposition → reservation (full) → session (all paid).
 */
export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  date: timestamp("date").notNull(),
  time: varchar("time", { length: 16 }).notNull(),
  locationId: varchar("locationId", { length: 32 }).notNull(),
  locationName: varchar("locationName", { length: 64 }).notNull(),
  locationColor: varchar("locationColor", { length: 16 }).default("#334155").notNull(),
  modeId: varchar("modeId", { length: 32 }).notNull(),
  modeName: varchar("modeName", { length: 64 }).notNull(),
  minParticipants: int("minParticipants").notNull(),
  price: int("price").notNull(),
  rewards: varchar("rewards", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["proposition", "reservation", "session"])
    .default("proposition")
    .notNull(),
  division: mysqlEnum("division", ["D1", "D2", "D3"]).default("D3").notNull(),
  createdByOpenId: varchar("createdByOpenId", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

/**
 * Participants in a proposal / reservation / session.
 */
export const proposalParticipants = mysqlTable("proposalParticipants", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  playerOpenId: varchar("playerOpenId", { length: 320 }).notNull(),
  playerName: varchar("playerName", { length: 128 }).notNull(),
  hasPaid: boolean("hasPaid").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type ProposalParticipant = typeof proposalParticipants.$inferSelect;
export type InsertProposalParticipant = typeof proposalParticipants.$inferInsert;

/**
 * Shop products purchasable with UNO points.
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["headphones", "watches", "shoes", "clothes", "accessories"])
    .notNull(),
  price: int("price").notNull(),
  image: varchar("image", { length: 16 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * UNO points transactions.
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  playerOpenId: varchar("playerOpenId", { length: 320 }).notNull(),
  type: mysqlEnum("type", ["send", "receive", "purchase", "reward"]).notNull(),
  amount: int("amount").notNull(),
  fromPlayerOpenId: varchar("fromPlayerOpenId", { length: 320 }),
  toPlayerOpenId: varchar("toPlayerOpenId", { length: 320 }),
  description: varchar("description", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
