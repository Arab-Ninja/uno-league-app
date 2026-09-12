CREATE TABLE `squad_challenge_seats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challenge_id` int NOT NULL,
	`squad_id` int NOT NULL,
	`player_id` int NOT NULL,
	`price_uno` int NOT NULL,
	`status` enum('pending','paid','released') NOT NULL DEFAULT 'pending',
	`paid_by` enum('player','treasury'),
	`paid_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`live_challenge_id` int GENERATED ALWAYS AS ((CASE WHEN `status` <> 'released' THEN `challenge_id` END)) STORED,
	`live_player_id` int GENERATED ALWAYS AS ((CASE WHEN `status` <> 'released' THEN `player_id` END)) STORED,
	CONSTRAINT `squad_challenge_seats_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_seats_live_unique` UNIQUE(`live_challenge_id`,`live_player_id`),
	CONSTRAINT `squad_seats_price_non_negative` CHECK(`squad_challenge_seats`.`price_uno` >= 0)
);
--> statement-breakpoint
ALTER TABLE `squad_challenge_seats` ADD CONSTRAINT `squad_challenge_seats_challenge_id_squad_challenges_id_fk` FOREIGN KEY (`challenge_id`) REFERENCES `squad_challenges`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenge_seats` ADD CONSTRAINT `squad_challenge_seats_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_challenge_seats` ADD CONSTRAINT `squad_challenge_seats_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `squad_seats_challenge_idx` ON `squad_challenge_seats` (`challenge_id`,`squad_id`);--> statement-breakpoint
CREATE INDEX `squad_seats_player_idx` ON `squad_challenge_seats` (`player_id`);