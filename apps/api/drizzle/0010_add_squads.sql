CREATE TABLE `squad_join_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squad_id` int NOT NULL,
	`player_id` int NOT NULL,
	`message` varchar(500),
	`status` enum('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`decided_by_player_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`decided_at` datetime(3),
	`pending_squad_id` int GENERATED ALWAYS AS ((CASE WHEN `status` = 'pending' THEN `squad_id` END)) STORED,
	`pending_player_id` int GENERATED ALWAYS AS ((CASE WHEN `status` = 'pending' THEN `player_id` END)) STORED,
	CONSTRAINT `squad_join_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_join_requests_pending_unique` UNIQUE(`pending_squad_id`,`pending_player_id`)
);
--> statement-breakpoint
CREATE TABLE `squad_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squad_id` int NOT NULL,
	`player_id` int NOT NULL,
	`role` enum('founder','captain','member') NOT NULL DEFAULT 'member',
	`status` enum('active','left','removed') NOT NULL DEFAULT 'active',
	`joined_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`left_at` datetime(3),
	`active_player_id` int GENERATED ALWAYS AS ((CASE WHEN `status` = 'active' THEN `player_id` END)) STORED,
	CONSTRAINT `squad_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_members_one_active_unique` UNIQUE(`active_player_id`)
);
--> statement-breakpoint
CREATE TABLE `squad_treasury_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squad_id` int NOT NULL,
	`player_id` int,
	`type` varchar(30) NOT NULL,
	`amount` int NOT NULL,
	`available_after` int NOT NULL,
	`locked_after` int NOT NULL,
	`reference_type` varchar(30),
	`reference_id` int,
	`description` varchar(200) NOT NULL,
	`idempotency_key` varchar(80),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `squad_treasury_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_treasury_idempotency_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `squad_treasury_available_non_negative` CHECK(`squad_treasury_transactions`.`available_after` >= 0),
	CONSTRAINT `squad_treasury_locked_non_negative` CHECK(`squad_treasury_transactions`.`locked_after` >= 0)
);
--> statement-breakpoint
CREATE TABLE `squads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(40) NOT NULL,
	`slug` varchar(40) NOT NULL,
	`description` varchar(500),
	`avatar_url` varchar(500),
	`founder_player_id` int NOT NULL,
	`rating` int NOT NULL DEFAULT 1000,
	`matches_played` int NOT NULL DEFAULT 0,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`draws` int NOT NULL DEFAULT 0,
	`streak` int NOT NULL DEFAULT 0,
	`total_uno_won` int NOT NULL DEFAULT 0,
	`treasury_available` int NOT NULL DEFAULT 0,
	`treasury_locked` int NOT NULL DEFAULT 0,
	`status` enum('active','dissolved') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `squads_id` PRIMARY KEY(`id`),
	CONSTRAINT `squads_name_unique` UNIQUE(`name`),
	CONSTRAINT `squads_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `squads_treasury_non_negative` CHECK(`squads`.`treasury_available` >= 0),
	CONSTRAINT `squads_locked_non_negative` CHECK(`squads`.`treasury_locked` >= 0),
	CONSTRAINT `squads_rating_non_negative` CHECK(`squads`.`rating` >= 0)
);
--> statement-breakpoint
ALTER TABLE `squad_join_requests` ADD CONSTRAINT `squad_join_requests_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_join_requests` ADD CONSTRAINT `squad_join_requests_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_members` ADD CONSTRAINT `squad_members_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_members` ADD CONSTRAINT `squad_members_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_treasury_transactions` ADD CONSTRAINT `squad_treasury_transactions_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squads` ADD CONSTRAINT `squads_founder_player_id_players_id_fk` FOREIGN KEY (`founder_player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `squad_join_requests_squad_idx` ON `squad_join_requests` (`squad_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_join_requests_player_idx` ON `squad_join_requests` (`player_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_members_squad_idx` ON `squad_members` (`squad_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_members_player_idx` ON `squad_members` (`player_id`);--> statement-breakpoint
CREATE INDEX `squad_treasury_squad_created_idx` ON `squad_treasury_transactions` (`squad_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `squads_rating_idx` ON `squads` (`rating`);