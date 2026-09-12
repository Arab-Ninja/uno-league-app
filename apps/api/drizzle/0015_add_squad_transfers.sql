CREATE TABLE `squad_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_id` int NOT NULL,
	`from_squad_id` int NOT NULL,
	`to_squad_id` int NOT NULL,
	`created_by_player_id` int NOT NULL,
	`fee_uno` int NOT NULL DEFAULT 0,
	`signing_bonus_uno` int NOT NULL DEFAULT 0,
	`negotiation_round` int NOT NULL DEFAULT 1,
	`status` enum('pending','awaiting_player','accepted','rejected','cancelled','expired') NOT NULL DEFAULT 'pending',
	`expires_at` datetime(3) NOT NULL,
	`decided_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`locked_player_id` int GENERATED ALWAYS AS ((CASE WHEN `status` = 'awaiting_player' THEN `player_id` END)) STORED,
	CONSTRAINT `squad_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_transfers_locked_unique` UNIQUE(`locked_player_id`),
	CONSTRAINT `squad_transfers_fee_non_negative` CHECK(`squad_transfers`.`fee_uno` >= 0),
	CONSTRAINT `squad_transfers_bonus_non_negative` CHECK(`squad_transfers`.`signing_bonus_uno` >= 0),
	CONSTRAINT `squad_transfers_distinct_squads` CHECK(`squad_transfers`.`from_squad_id` <> `squad_transfers`.`to_squad_id`)
);
--> statement-breakpoint
ALTER TABLE `squad_members` ADD `listed_at` datetime(3);--> statement-breakpoint
ALTER TABLE `squad_transfers` ADD CONSTRAINT `squad_transfers_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_transfers` ADD CONSTRAINT `squad_transfers_from_squad_id_squads_id_fk` FOREIGN KEY (`from_squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_transfers` ADD CONSTRAINT `squad_transfers_to_squad_id_squads_id_fk` FOREIGN KEY (`to_squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_transfers` ADD CONSTRAINT `squad_transfers_created_by_player_id_players_id_fk` FOREIGN KEY (`created_by_player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `squad_transfers_player_idx` ON `squad_transfers` (`player_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_transfers_from_idx` ON `squad_transfers` (`from_squad_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_transfers_to_idx` ON `squad_transfers` (`to_squad_id`,`status`);--> statement-breakpoint
CREATE INDEX `squad_transfers_expiry_idx` ON `squad_transfers` (`status`,`expires_at`);