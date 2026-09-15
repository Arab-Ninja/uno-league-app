-- Tournois entre SQUADs : plateau, inscriptions et tableau à élimination
-- directe (TOUR-001).
--
-- Les trois contraintes CHECK sont posées **dans** le CREATE TABLE, jamais par
-- un ALTER TABLE : TiDB refuse la seconde forme (cf. DECISIONS §40, et le test
-- `migration.test.ts` qui la barre).

CREATE TABLE `tournament_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tournament_id` int NOT NULL,
	`squad_id` int NOT NULL,
	`registered_by_player_id` int NOT NULL,
	`rating_at_entry` int NOT NULL,
	`seed` int,
	`entry_fee_uno` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `tournament_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `tournament_entries_unique` UNIQUE(`tournament_id`,`squad_id`)
);
--> statement-breakpoint
CREATE TABLE `tournament_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tournament_id` int NOT NULL,
	`round` varchar(12) NOT NULL,
	`slot` int NOT NULL,
	`home_entry_id` int,
	`away_entry_id` int,
	`score_home` int,
	`score_away` int,
	`winner_entry_id` int,
	`played_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `tournament_matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `tournament_matches_position` UNIQUE(`tournament_id`,`round`,`slot`)
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`venue_id` varchar(40) NOT NULL,
	`venue_name` varchar(80) NOT NULL,
	`starts_at_utc` datetime(3) NOT NULL,
	`local_date` varchar(10) NOT NULL,
	`slot_start_hour` int NOT NULL,
	`local_time_label` varchar(20) NOT NULL,
	`timezone` varchar(60) NOT NULL,
	`size` int NOT NULL,
	`entry_fee_uno` int NOT NULL DEFAULT 0,
	`prize_uno` int NOT NULL DEFAULT 0,
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`winner_squad_id` int,
	`created_by_user_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `tournaments_id` PRIMARY KEY(`id`),
	CONSTRAINT `tournaments_entry_fee_non_negative` CHECK(`tournaments`.`entry_fee_uno` >= 0),
	CONSTRAINT `tournaments_prize_non_negative` CHECK(`tournaments`.`prize_uno` >= 0),
	CONSTRAINT `tournaments_size_allowed` CHECK(`tournaments`.`size` IN (4, 8, 16, 32))
);
--> statement-breakpoint
ALTER TABLE `tournament_entries` ADD CONSTRAINT `tournament_entries_tournament_id_tournaments_id_fk` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_entries` ADD CONSTRAINT `tournament_entries_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_matches` ADD CONSTRAINT `tournament_matches_tournament_id_tournaments_id_fk` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tournament_entries_squad_idx` ON `tournament_entries` (`squad_id`);--> statement-breakpoint
CREATE INDEX `tournament_matches_tournament_idx` ON `tournament_matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournaments_status_idx` ON `tournaments` (`status`,`starts_at_utc`);--> statement-breakpoint
CREATE INDEX `tournaments_date_idx` ON `tournaments` (`starts_at_utc`);