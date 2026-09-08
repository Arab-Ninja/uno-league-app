CREATE TABLE `admin_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(40) NOT NULL,
	`category` enum('calendar','payment','shop','wallet') NOT NULL,
	`title` varchar(140) NOT NULL,
	`body` varchar(300) NOT NULL,
	`entity_type` varchar(40),
	`entity_id` int,
	`player_id` int,
	`event_key` varchar(120) NOT NULL,
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `admin_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_events_key_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shop_item_id` int NOT NULL,
	`player_id` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text,
	`verified_purchase` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `product_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_reviews_unique` UNIQUE(`shop_item_id`,`player_id`),
	CONSTRAINT `product_reviews_rating_range` CHECK(`product_reviews`.`rating` BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `proposal_substitutes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`player_id` int NOT NULL,
	`status` enum('waiting','promoted','withdrawn') NOT NULL DEFAULT 'waiting',
	`replaced_player_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`promoted_at` datetime(3),
	CONSTRAINT `proposal_substitutes_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_substitutes_unique` UNIQUE(`proposal_id`,`player_id`)
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(40) NOT NULL,
	`name` varchar(80) NOT NULL,
	`headline` varchar(120),
	`description` text NOT NULL,
	`address` varchar(200),
	`timezone` varchar(64) NOT NULL,
	`images` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `venues_id` PRIMARY KEY(`id`),
	CONSTRAINT `venues_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `size` varchar(10);--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD `session_rank` int;--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD `session_points` decimal(7,1);--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD `movement` enum('promoted','relegated','stayed');--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD `replaced_player_id` int;--> statement-breakpoint
ALTER TABLE `proposals` ADD `payment_deadline` datetime(3);--> statement-breakpoint
ALTER TABLE `proposals` ADD `motm_player_id` int;--> statement-breakpoint
ALTER TABLE `shop_items` ADD `size_kind` enum('none','clothing','shoes') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_items` ADD `sizes` json;--> statement-breakpoint
ALTER TABLE `admin_events` ADD CONSTRAINT `admin_events_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_shop_item_id_shop_items_id_fk` FOREIGN KEY (`shop_item_id`) REFERENCES `shop_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_substitutes` ADD CONSTRAINT `proposal_substitutes_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_substitutes` ADD CONSTRAINT `proposal_substitutes_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_events_created_idx` ON `admin_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_events_unread_idx` ON `admin_events` (`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_events_category_idx` ON `admin_events` (`category`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_reviews_item_idx` ON `product_reviews` (`shop_item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `proposal_substitutes_player_idx` ON `proposal_substitutes` (`player_id`);--> statement-breakpoint
CREATE INDEX `proposal_substitutes_queue_idx` ON `proposal_substitutes` (`proposal_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `venues_active_idx` ON `venues` (`active`,`sort_order`);--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_motm_player_id_players_id_fk` FOREIGN KEY (`motm_player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;