CREATE TABLE `announcement_reads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`announcement_id` int NOT NULL,
	`player_id` int NOT NULL,
	`read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `announcement_reads_id` PRIMARY KEY(`id`),
	CONSTRAINT `announcement_reads_unique` UNIQUE(`announcement_id`,`player_id`)
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('info','alert','reward','maintenance') NOT NULL DEFAULT 'info',
	`title` varchar(120) NOT NULL,
	`content` text NOT NULL,
	`status` enum('draft','published','expired','archived') NOT NULL DEFAULT 'draft',
	`published_at` datetime(3),
	`expires_at` datetime(3),
	`target_division` enum('D1','D2','D3'),
	`target_role` enum('user','admin'),
	`created_by_user_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_user_id` int,
	`action` varchar(60) NOT NULL,
	`entity_type` varchar(40) NOT NULL,
	`entity_id` int,
	`before_json` json,
	`after_json` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_id` int NOT NULL,
	`platform` enum('ios','android','web') NOT NULL,
	`push_token` varchar(512) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`last_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `device_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_tokens_token_unique` UNIQUE(`push_token`)
);
--> statement-breakpoint
CREATE TABLE `match_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`match_id` int NOT NULL,
	`player_id` int NOT NULL,
	`goals` int NOT NULL DEFAULT 0,
	`assists` int NOT NULL DEFAULT 0,
	`defenses` int NOT NULL DEFAULT 0,
	`saves` int NOT NULL DEFAULT 0,
	`motm` boolean NOT NULL DEFAULT false,
	CONSTRAINT `match_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `match_stats_unique` UNIQUE(`match_id`,`player_id`),
	CONSTRAINT `match_stats_goals_non_negative` CHECK(`match_stats`.`goals` >= 0),
	CONSTRAINT `match_stats_assists_non_negative` CHECK(`match_stats`.`assists` >= 0),
	CONSTRAINT `match_stats_defenses_non_negative` CHECK(`match_stats`.`defenses` >= 0),
	CONSTRAINT `match_stats_saves_non_negative` CHECK(`match_stats`.`saves` >= 0)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`team_a_id` int NOT NULL,
	`team_b_id` int NOT NULL,
	`score_a` int NOT NULL DEFAULT 0,
	`score_b` int NOT NULL DEFAULT 0,
	`status` enum('scheduled','live','finished','validated','corrected') NOT NULL DEFAULT 'scheduled',
	`played_at` datetime(3),
	`validated_at` datetime(3),
	`validated_by_user_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `matches_score_a_non_negative` CHECK(`matches`.`score_a` >= 0),
	CONSTRAINT `matches_score_b_non_negative` CHECK(`matches`.`score_b` >= 0)
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_id` int NOT NULL,
	`event_key` varchar(120) NOT NULL,
	`channel` enum('push','inapp') NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` varchar(300) NOT NULL,
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notification_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_deliveries_unique` UNIQUE(`player_id`,`event_key`,`channel`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`shop_item_id` int,
	`product_name_snapshot` varchar(120) NOT NULL,
	`unit_price_uno` int NOT NULL,
	`quantity` int NOT NULL,
	`total_uno` int NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_items_quantity_positive` CHECK(`order_items`.`quantity` > 0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_id` int NOT NULL,
	`status` enum('pending','paid','fulfilled','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`total_uno` int NOT NULL,
	`idempotency_key` varchar(80),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`fulfilled_at` datetime(3),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_idempotency_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `orders_total_non_negative` CHECK(`orders`.`total_uno` >= 0)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`player_id` int NOT NULL,
	`method` varchar(30) NOT NULL,
	`status` enum('pending','initiated','paid','failed','refunded') NOT NULL DEFAULT 'pending',
	`amount_uno` int NOT NULL,
	`amount_eur_cents` int NOT NULL,
	`provider` varchar(30),
	`provider_intent_id` varchar(120),
	`idempotency_key` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`paid_at` datetime(3),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_idempotency_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `payments_provider_intent_unique` UNIQUE(`provider_intent_id`),
	CONSTRAINT `payments_amount_non_negative` CHECK(`payments`.`amount_uno` >= 0)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`first_name` varchar(50) NOT NULL,
	`last_name` varchar(50) NOT NULL,
	`display_name` varchar(101) NOT NULL,
	`address` varchar(200),
	`nationality` varchar(2) NOT NULL,
	`date_of_birth` varchar(10) NOT NULL,
	`profile_photo_url` varchar(2048),
	`division` enum('D1','D2','D3') NOT NULL DEFAULT 'D3',
	`uno_points` int NOT NULL DEFAULT 0,
	`xp` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`goals` int NOT NULL DEFAULT 0,
	`assists` int NOT NULL DEFAULT 0,
	`defenses` int NOT NULL DEFAULT 0,
	`saves` int NOT NULL DEFAULT 0,
	`motm` int NOT NULL DEFAULT 0,
	`push_enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `players_id` PRIMARY KEY(`id`),
	CONSTRAINT `players_user_unique` UNIQUE(`user_id`),
	CONSTRAINT `players_uno_non_negative` CHECK(`players`.`uno_points` >= 0),
	CONSTRAINT `players_xp_non_negative` CHECK(`players`.`xp` >= 0),
	CONSTRAINT `players_level_min` CHECK(`players`.`level` >= 1),
	CONSTRAINT `players_goals_non_negative` CHECK(`players`.`goals` >= 0),
	CONSTRAINT `players_assists_non_negative` CHECK(`players`.`assists` >= 0),
	CONSTRAINT `players_defenses_non_negative` CHECK(`players`.`defenses` >= 0),
	CONSTRAINT `players_saves_non_negative` CHECK(`players`.`saves` >= 0),
	CONSTRAINT `players_motm_non_negative` CHECK(`players`.`motm` >= 0)
);
--> statement-breakpoint
CREATE TABLE `proposal_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`player_id` int NOT NULL,
	`has_paid` boolean NOT NULL DEFAULT false,
	`payment_id` int,
	`joined_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`left_at` datetime(3),
	CONSTRAINT `proposal_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_participants_unique` UNIQUE(`proposal_id`,`player_id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`starts_at_utc` datetime(3) NOT NULL,
	`local_date` varchar(10) NOT NULL,
	`slot_start_hour` int NOT NULL,
	`local_time_label` varchar(20) NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`venue_id` varchar(40) NOT NULL,
	`venue_name` varchar(80) NOT NULL,
	`mode_id` varchar(20) NOT NULL,
	`division` enum('D1','D2','D3'),
	`min_participants` int NOT NULL,
	`price_eur` int NOT NULL,
	`price_uno` int NOT NULL,
	`reward_policy_version` int NOT NULL DEFAULT 1,
	`status` enum('proposal','reservation','session','completed','cancelled') NOT NULL DEFAULT 'proposal',
	`participant_count` int NOT NULL DEFAULT 0,
	`paid_count` int NOT NULL DEFAULT 0,
	`payment_complete` boolean NOT NULL DEFAULT false,
	`creator_player_id` int NOT NULL,
	`season_id` int,
	`active_slot_key` varchar(120),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposals_active_slot_unique` UNIQUE(`active_slot_key`),
	CONSTRAINT `proposals_counts_non_negative` CHECK(`proposals`.`participant_count` >= 0),
	CONSTRAINT `proposals_paid_non_negative` CHECK(`proposals`.`paid_count` >= 0),
	CONSTRAINT `proposals_price_non_negative` CHECK(`proposals`.`price_uno` >= 0)
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(60) NOT NULL,
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3) NOT NULL,
	`is_current` boolean NOT NULL DEFAULT false,
	`promotion_count` int NOT NULL DEFAULT 3,
	`relegation_count` int NOT NULL DEFAULT 3,
	`reward_policy_version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `seasons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_used_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`user_agent` varchar(255),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `shop_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`category` enum('headphones','watches','shoes','clothes','accessories') NOT NULL,
	`price_uno` int NOT NULL,
	`price_euros` decimal(10,2),
	`product_url` varchar(2048),
	`images` json NOT NULL DEFAULT ('[]'),
	`available` boolean NOT NULL DEFAULT true,
	`archived` boolean NOT NULL DEFAULT false,
	`stock` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shop_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `shop_items_price_positive` CHECK(`shop_items`.`price_uno` > 0)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team_id` int NOT NULL,
	`player_id` int NOT NULL,
	CONSTRAINT `team_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_members_unique` UNIQUE(`team_id`,`player_id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`name` varchar(60) NOT NULL,
	`team_index` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_proposal_index_unique` UNIQUE(`proposal_id`,`team_index`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_id` int NOT NULL,
	`type` varchar(30) NOT NULL,
	`amount` int NOT NULL,
	`balance_after` int NOT NULL,
	`from_player_id` int,
	`to_player_id` int,
	`reference_type` varchar(30),
	`reference_id` int,
	`description` varchar(200) NOT NULL,
	`idempotency_key` varchar(80),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_idempotency_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `transactions_balance_non_negative` CHECK(`transactions`.`balance_after` >= 0)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(254) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`status` enum('active','suspended','deleted','anonymized') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_signed_in` datetime(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `announcement_reads` ADD CONSTRAINT `announcement_reads_announcement_id_announcements_id_fk` FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `announcement_reads` ADD CONSTRAINT `announcement_reads_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_tokens` ADD CONSTRAINT `device_tokens_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_stats` ADD CONSTRAINT `match_stats_match_id_matches_id_fk` FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_stats` ADD CONSTRAINT `match_stats_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `matches` ADD CONSTRAINT `matches_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `matches` ADD CONSTRAINT `matches_team_a_id_teams_id_fk` FOREIGN KEY (`team_a_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `matches` ADD CONSTRAINT `matches_team_b_id_teams_id_fk` FOREIGN KEY (`team_b_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `matches` ADD CONSTRAINT `matches_validated_by_user_id_users_id_fk` FOREIGN KEY (`validated_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_shop_item_id_shop_items_id_fk` FOREIGN KEY (`shop_item_id`) REFERENCES `shop_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `players` ADD CONSTRAINT `players_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD CONSTRAINT `proposal_participants_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD CONSTRAINT `proposal_participants_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_creator_player_id_players_id_fk` FOREIGN KEY (`creator_player_id`) REFERENCES `players`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_season_id_seasons_id_fk` FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `announcements_published_idx` ON `announcements` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `device_tokens_player_idx` ON `device_tokens` (`player_id`);--> statement-breakpoint
CREATE INDEX `match_stats_player_idx` ON `match_stats` (`player_id`);--> statement-breakpoint
CREATE INDEX `matches_proposal_idx` ON `matches` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_player_idx` ON `notification_deliveries` (`player_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `orders_player_idx` ON `orders` (`player_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_proposal_idx` ON `payments` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `payments_player_idx` ON `payments` (`player_id`);--> statement-breakpoint
CREATE INDEX `players_division_idx` ON `players` (`division`);--> statement-breakpoint
CREATE INDEX `players_display_name_idx` ON `players` (`display_name`);--> statement-breakpoint
CREATE INDEX `proposal_participants_player_idx` ON `proposal_participants` (`player_id`);--> statement-breakpoint
CREATE INDEX `proposals_starts_at_idx` ON `proposals` (`starts_at_utc`);--> statement-breakpoint
CREATE INDEX `proposals_status_idx` ON `proposals` (`status`);--> statement-breakpoint
CREATE INDEX `proposals_local_date_idx` ON `proposals` (`local_date`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `shop_items_category_idx` ON `shop_items` (`category`);--> statement-breakpoint
CREATE INDEX `shop_items_available_idx` ON `shop_items` (`available`,`archived`);--> statement-breakpoint
CREATE INDEX `team_members_player_idx` ON `team_members` (`player_id`);--> statement-breakpoint
CREATE INDEX `transactions_player_created_idx` ON `transactions` (`player_id`,`created_at`);