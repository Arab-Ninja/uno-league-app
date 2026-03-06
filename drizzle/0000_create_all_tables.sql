CREATE TABLE `users` (
	`id` int NOT NULL AUTO_INCREMENT,
	`openId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(255),
	`loginMethod` varchar(100),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY (`id`),
	CONSTRAINT `users_openId_unique` UNIQUE (`openId`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` int NOT NULL AUTO_INCREMENT,
	`openId` varchar(255) NOT NULL,
	`firstName` varchar(255),
	`lastName` varchar(255),
	`name` varchar(255) NOT NULL,
	`email` varchar(255),
	`address` text,
	`division` enum('D1','D2','D3') NOT NULL DEFAULT 'D3',
	`unoPoints` int NOT NULL DEFAULT 1000,
	`xp` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`statsGoals` int NOT NULL DEFAULT 0,
	`statsAssists` int NOT NULL DEFAULT 0,
	`statsDefenses` int NOT NULL DEFAULT 0,
	`statsSaves` int NOT NULL DEFAULT 0,
	`statsMotm` int NOT NULL DEFAULT 0,
	`avatar` varchar(255),
	`nationality` varchar(100),
	`dateOfBirth` varchar(50),
	`profilePhoto` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY (`id`),
	CONSTRAINT `players_openId_unique` UNIQUE (`openId`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int NOT NULL AUTO_INCREMENT,
	`modeId` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`playerOpenIds` varchar(5000) NOT NULL DEFAULT '[]',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` int NOT NULL AUTO_INCREMENT,
	`modeId` varchar(100) NOT NULL,
	`sessionId` int,
	`teamAId` int,
	`teamBId` int,
	`teamAName` varchar(255),
	`teamBName` varchar(255),
	`scoreA` int NOT NULL DEFAULT 0,
	`scoreB` int NOT NULL DEFAULT 0,
	`statistics` text NOT NULL DEFAULT ('{}'),
	`playedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `matches_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` int NOT NULL AUTO_INCREMENT,
	`date` timestamp NOT NULL,
	`time` varchar(50) NOT NULL,
	`locationId` varchar(100) NOT NULL,
	`locationName` varchar(255) NOT NULL,
	`locationColor` varchar(20) NOT NULL DEFAULT '#334155',
	`modeId` varchar(100) NOT NULL,
	`modeName` varchar(255) NOT NULL,
	`minParticipants` int NOT NULL,
	`price` int NOT NULL,
	`rewards` text NOT NULL,
	`status` enum('proposition','reservation','session') NOT NULL DEFAULT 'proposition',
	`division` enum('D1','D2','D3') NOT NULL DEFAULT 'D3',
	`paymentComplete` boolean NOT NULL DEFAULT false,
	`teamIds` varchar(500) NOT NULL DEFAULT '[]',
	`createdByOpenId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `proposalParticipants` (
	`id` int NOT NULL AUTO_INCREMENT,
	`proposalId` int NOT NULL,
	`playerOpenId` varchar(255) NOT NULL,
	`playerName` varchar(255) NOT NULL,
	`hasPaid` boolean NOT NULL DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `proposalParticipants_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `shopItems` (
	`id` int NOT NULL AUTO_INCREMENT,
	`name` varchar(255) NOT NULL,
	`images` text NOT NULL DEFAULT ('[]'),
	`description` text,
	`productUrl` varchar(500),
	`priceUno` int NOT NULL,
	`priceEuros` double,
	`available` boolean NOT NULL DEFAULT true,
	`category` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `shopItems_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int NOT NULL AUTO_INCREMENT,
	`playerOpenId` varchar(255) NOT NULL,
	`type` enum('send','receive','purchase','reward') NOT NULL,
	`amount` int NOT NULL,
	`fromPlayerOpenId` varchar(255),
	`toPlayerOpenId` varchar(255),
	`description` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY (`id`)
);
