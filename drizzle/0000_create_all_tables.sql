CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL UNIQUE,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text NOT NULL DEFAULT 'user',
	`createdAt` integer NOT NULL DEFAULT (unixepoch()),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch()),
	`lastSignedIn` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL UNIQUE,
	`firstName` text,
	`lastName` text,
	`name` text NOT NULL,
	`email` text,
	`address` text,
	`division` text NOT NULL DEFAULT 'D3',
	`unoPoints` integer NOT NULL DEFAULT 1000,
	`xp` integer NOT NULL DEFAULT 0,
	`level` integer NOT NULL DEFAULT 1,
	`statsGoals` integer NOT NULL DEFAULT 0,
	`statsAssists` integer NOT NULL DEFAULT 0,
	`statsDefenses` integer NOT NULL DEFAULT 0,
	`statsSaves` integer NOT NULL DEFAULT 0,
	`statsMotm` integer NOT NULL DEFAULT 0,
	`avatar` text,
	`nationality` text,
	`dateOfBirth` text,
	`profilePhoto` text,
	`createdAt` integer NOT NULL DEFAULT (unixepoch()),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`modeId` text NOT NULL,
	`name` text NOT NULL,
	`playerOpenIds` text NOT NULL DEFAULT '[]',
	`createdAt` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`modeId` text NOT NULL,
	`sessionId` integer,
	`teamAId` integer,
	`teamBId` integer,
	`teamAName` text,
	`teamBName` text,
	`scoreA` integer NOT NULL DEFAULT 0,
	`scoreB` integer NOT NULL DEFAULT 0,
	`statistics` text NOT NULL DEFAULT '{}',
	`playedAt` integer,
	`createdAt` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` integer NOT NULL,
	`time` text NOT NULL,
	`locationId` text NOT NULL,
	`locationName` text NOT NULL,
	`locationColor` text NOT NULL DEFAULT '#334155',
	`modeId` text NOT NULL,
	`modeName` text NOT NULL,
	`minParticipants` integer NOT NULL,
	`price` integer NOT NULL,
	`rewards` text NOT NULL,
	`status` text NOT NULL DEFAULT 'proposition',
	`division` text NOT NULL DEFAULT 'D3',
	`paymentComplete` integer NOT NULL DEFAULT false,
	`teamIds` text NOT NULL DEFAULT '[]',
	`createdByOpenId` text,
	`createdAt` integer NOT NULL DEFAULT (unixepoch()),
	`updatedAt` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `proposalParticipants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposalId` integer NOT NULL,
	`playerOpenId` text NOT NULL,
	`playerName` text NOT NULL,
	`hasPaid` integer NOT NULL DEFAULT false,
	`joinedAt` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `shopItems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`images` text NOT NULL DEFAULT '[]',
	`description` text,
	`productUrl` text,
	`priceUno` integer NOT NULL,
	`priceEuros` real,
	`available` integer NOT NULL DEFAULT true,
	`category` text,
	`createdAt` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`playerOpenId` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`fromPlayerOpenId` text,
	`toPlayerOpenId` text,
	`description` text NOT NULL,
	`createdAt` integer NOT NULL DEFAULT (unixepoch())
);
