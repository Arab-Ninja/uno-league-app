CREATE TABLE `squad_challenge_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challenge_id` int NOT NULL,
	`offered_by_squad_id` int NOT NULL,
	`created_by_player_id` int NOT NULL,
	`stake_uno` int NOT NULL,
	`round_number` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `squad_challenge_offers_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_challenge_offers_round_unique` UNIQUE(`challenge_id`,`round_number`)
);
--> statement-breakpoint
CREATE TABLE `squad_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challenger_squad_id` int NOT NULL,
	`challenged_squad_id` int NOT NULL,
	`created_by_player_id` int NOT NULL,
	`venue_id` varchar(40) NOT NULL,
	`venue_name` varchar(80) NOT NULL,
	`scheduled_at_utc` datetime(3) NOT NULL,
	`duration_minutes` int NOT NULL,
	`initial_stake_uno` int NOT NULL DEFAULT 0,
	`current_stake_uno` int NOT NULL DEFAULT 0,
	`negotiation_round` int NOT NULL DEFAULT 1,
	`awaiting_squad_id` int,
	`status` enum('pending','accepted','rejected','cancelled','expired','completed') NOT NULL DEFAULT 'pending',
	`expires_at` datetime(3) NOT NULL,
	`match_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `squad_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_challenges_stake_non_negative` CHECK(`squad_challenges`.`current_stake_uno` >= 0),
	CONSTRAINT `squad_challenges_duration_allowed` CHECK(`squad_challenges`.`duration_minutes` IN (60, 120)),
	CONSTRAINT `squad_challenges_distinct_squads` CHECK(`squad_challenges`.`challenger_squad_id` <> `squad_challenges`.`challenged_squad_id`)
);
--> statement-breakpoint
CREATE TABLE `squad_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('squad','challenge','transfer') NOT NULL,
	`scope_id` int NOT NULL,
	`player_id` int NOT NULL,
	`squad_id` int,
	`body` varchar(1000) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `squad_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `squad_challenge_offers` ADD CONSTRAINT `squad_challenge_offers_challenge_id_squad_challenges_id_fk` FOREIGN KEY (`challenge_id`) REFERENCES `squad_challenges`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenge_offers` ADD CONSTRAINT `squad_challenge_offers_offered_by_squad_id_squads_id_fk` FOREIGN KEY (`offered_by_squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenge_offers` ADD CONSTRAINT `squad_challenge_offers_created_by_player_id_players_id_fk` FOREIGN KEY (`created_by_player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenges` ADD CONSTRAINT `squad_challenges_challenger_squad_id_squads_id_fk` FOREIGN KEY (`challenger_squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenges` ADD CONSTRAINT `squad_challenges_challenged_squad_id_squads_id_fk` FOREIGN KEY (`challenged_squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenges` ADD CONSTRAINT `squad_challenges_created_by_player_id_players_id_fk` FOREIGN KEY (`created_by_player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_messages` ADD CONSTRAINT `squad_messages_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `squad_challenge_offers_challenge_idx` ON `squad_challenge_offers` (`challenge_id`);--> statement-breakpoint
CREATE INDEX `squad_challenges_challenger_idx` ON `squad_challenges` (`challenger_squad_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_challenges_challenged_idx` ON `squad_challenges` (`challenged_squad_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_challenges_expiry_idx` ON `squad_challenges` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `squad_messages_thread_idx` ON `squad_messages` (`scope`,`scope_id`,`id`);