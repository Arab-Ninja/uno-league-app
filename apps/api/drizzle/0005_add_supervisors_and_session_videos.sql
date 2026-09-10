CREATE TABLE `session_videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`label` varchar(80),
	`provider` enum('youtube','vimeo','other') NOT NULL DEFAULT 'other',
	`added_by_player_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `session_videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `players` ADD `is_supervisor` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `session_videos` ADD CONSTRAINT `session_videos_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_videos` ADD CONSTRAINT `session_videos_added_by_player_id_players_id_fk` FOREIGN KEY (`added_by_player_id`) REFERENCES `players`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `session_videos_proposal_idx` ON `session_videos` (`proposal_id`,`created_at`);