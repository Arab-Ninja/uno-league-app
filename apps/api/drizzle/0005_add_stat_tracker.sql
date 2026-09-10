CREATE TABLE `stat_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` varchar(64) NOT NULL,
	`match_id` int NOT NULL,
	`type` enum('goal','own_goal','defense','save','gk_in') NOT NULL,
	`participant_id` int NOT NULL,
	`assist_participant_id` int,
	`team_id` int NOT NULL,
	`clock_ms` int NOT NULL DEFAULT 0,
	`video_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stat_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `stat_events_client_id_unique` UNIQUE(`client_id`),
	CONSTRAINT `stat_events_clock_non_negative` CHECK(`stat_events`.`clock_ms` >= 0)
);
--> statement-breakpoint
CREATE TABLE `stat_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`match_order` int NOT NULL,
	`team_a_id` int NOT NULL,
	`team_b_id` int NOT NULL,
	`status` enum('pending','playing','finished') NOT NULL DEFAULT 'pending',
	`video_start_ms` int,
	`declared_score_a` int,
	`declared_score_b` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stat_matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `stat_matches_session_order_unique` UNIQUE(`session_id`,`match_order`)
);
--> statement-breakpoint
CREATE TABLE `stat_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`team_id` int NOT NULL,
	`player_id` int,
	`guest_name` varchar(40),
	`shirt_number` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stat_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `stat_participants_session_player_unique` UNIQUE(`session_id`,`player_id`)
);
--> statement-breakpoint
CREATE TABLE `stat_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(80) NOT NULL,
	`local_date` varchar(10) NOT NULL,
	`slot_start_hour` int NOT NULL DEFAULT 20,
	`venue_id` varchar(40),
	`venue_name` varchar(80),
	`mode_id` varchar(20) NOT NULL DEFAULT 'league',
	`division` enum('D1','D2','D3'),
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`video_url` varchar(500),
	`proposal_id` int,
	`published_proposal_id` int,
	`published_at` datetime(3),
	`created_by_user_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stat_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stat_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`name` varchar(40) NOT NULL,
	`color` varchar(9) NOT NULL,
	`team_index` int NOT NULL,
	CONSTRAINT `stat_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `stat_teams_session_index_unique` UNIQUE(`session_id`,`team_index`)
);
--> statement-breakpoint
ALTER TABLE `stat_events` ADD CONSTRAINT `stat_events_match_id_stat_matches_id_fk` FOREIGN KEY (`match_id`) REFERENCES `stat_matches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_events` ADD CONSTRAINT `stat_events_participant_id_stat_participants_id_fk` FOREIGN KEY (`participant_id`) REFERENCES `stat_participants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_events` ADD CONSTRAINT `stat_events_assist_participant_id_stat_participants_id_fk` FOREIGN KEY (`assist_participant_id`) REFERENCES `stat_participants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_events` ADD CONSTRAINT `stat_events_team_id_stat_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `stat_teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_matches` ADD CONSTRAINT `stat_matches_session_id_stat_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `stat_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_matches` ADD CONSTRAINT `stat_matches_team_a_id_stat_teams_id_fk` FOREIGN KEY (`team_a_id`) REFERENCES `stat_teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_matches` ADD CONSTRAINT `stat_matches_team_b_id_stat_teams_id_fk` FOREIGN KEY (`team_b_id`) REFERENCES `stat_teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_participants` ADD CONSTRAINT `stat_participants_session_id_stat_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `stat_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_participants` ADD CONSTRAINT `stat_participants_team_id_stat_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `stat_teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_participants` ADD CONSTRAINT `stat_participants_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_sessions` ADD CONSTRAINT `stat_sessions_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_sessions` ADD CONSTRAINT `stat_sessions_published_proposal_id_proposals_id_fk` FOREIGN KEY (`published_proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_sessions` ADD CONSTRAINT `stat_sessions_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stat_teams` ADD CONSTRAINT `stat_teams_session_id_stat_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `stat_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `stat_events_match_idx` ON `stat_events` (`match_id`,`clock_ms`);--> statement-breakpoint
CREATE INDEX `stat_participants_team_idx` ON `stat_participants` (`team_id`);--> statement-breakpoint
CREATE INDEX `stat_sessions_date_idx` ON `stat_sessions` (`local_date`);--> statement-breakpoint
CREATE INDEX `stat_sessions_status_idx` ON `stat_sessions` (`status`);