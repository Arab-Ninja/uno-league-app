ALTER TABLE `matches` ADD `match_order` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `account_type` enum('player','referee') DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `sessions_refereed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `referee_player_id` int;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_referee_player_id_players_id_fk` FOREIGN KEY (`referee_player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;