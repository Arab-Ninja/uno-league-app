CREATE TABLE IF NOT EXISTS `players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(320) NOT NULL,
	`name` varchar(128) NOT NULL,
	`email` varchar(320),
	`division` enum('D1','D2','D3') NOT NULL DEFAULT 'D3',
	`unoPoints` int NOT NULL DEFAULT 1000,
	`xp` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`goals` int NOT NULL DEFAULT 0,
	`assists` int NOT NULL DEFAULT 0,
	`defenses` int NOT NULL DEFAULT 0,
	`saves` int NOT NULL DEFAULT 0,
	`motm` int NOT NULL DEFAULT 0,
	`avatar` varchar(16),
	`nationality` varchar(64),
	`dateOfBirth` varchar(32),
	`profilePhoto` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY(`id`),
	CONSTRAINT `players_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` timestamp NOT NULL,
	`time` varchar(16) NOT NULL,
	`locationId` varchar(32) NOT NULL,
	`locationName` varchar(64) NOT NULL,
	`locationColor` varchar(16) NOT NULL DEFAULT '#334155',
	`modeId` varchar(32) NOT NULL,
	`modeName` varchar(64) NOT NULL,
	`minParticipants` int NOT NULL,
	`price` int NOT NULL,
	`rewards` varchar(128) NOT NULL,
	`division` enum('D1','D2','D3') NOT NULL DEFAULT 'D3',
	`status` enum('proposition','reservation','session') NOT NULL DEFAULT 'proposition',
	`createdByOpenId` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `proposalParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`playerOpenId` varchar(320) NOT NULL,
	`playerName` varchar(128) NOT NULL,
	`hasPaid` boolean NOT NULL DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposalParticipants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` enum('headphones','watches','shoes','clothes','accessories') NOT NULL,
	`price` int NOT NULL,
	`image` varchar(16) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerOpenId` varchar(320) NOT NULL,
	`type` enum('send','receive','purchase','reward') NOT NULL,
	`amount` int NOT NULL,
	`fromPlayerOpenId` varchar(320),
	`toPlayerOpenId` varchar(320),
	`description` varchar(256) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
