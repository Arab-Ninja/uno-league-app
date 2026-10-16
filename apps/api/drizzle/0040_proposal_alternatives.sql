-- Alternatives d'une séance (ALT-001).
--
-- `proposals.moved_at` : le dernier changement de lieu ou d'heure d'une
-- séance. Nul pour toutes les séances existantes, jamais déplacées.
--
-- `proposal_polls`, `proposal_poll_options`, `proposal_poll_votes` : le vote
-- des inscrits sur deux ou trois créneaux du même jour. L'index unique sur
-- `active_proposal_id` garantit un seul vote en cours par séance.
--
-- Une colonne nulle et trois tables neuves, que le code déjà déployé ne lit
-- pas : la migration peut passer avant le déploiement.

ALTER TABLE `proposals` ADD `moved_at` datetime(3);
--> statement-breakpoint
CREATE TABLE `proposal_polls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'open',
	`active_proposal_id` int,
	`reason` varchar(200),
	`closes_at` datetime(3) NOT NULL,
	`reminded_at` datetime(3),
	`decided_at` datetime(3),
	`winning_option_id` int,
	`created_by_user_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `proposal_polls_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_polls_active_unique` UNIQUE(`active_proposal_id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_poll_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poll_id` int NOT NULL,
	`position` int NOT NULL,
	`venue_id` varchar(40) NOT NULL,
	`venue_name` varchar(80) NOT NULL,
	`slot_start_hour` int NOT NULL,
	`local_time_label` varchar(20) NOT NULL,
	CONSTRAINT `proposal_poll_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_poll_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poll_id` int NOT NULL,
	`player_id` int NOT NULL,
	`option_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `proposal_poll_votes_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_poll_votes_unique` UNIQUE(`poll_id`,`player_id`)
);
--> statement-breakpoint
ALTER TABLE `proposal_polls` ADD CONSTRAINT `proposal_polls_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `proposal_polls` ADD CONSTRAINT `proposal_polls_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `proposal_poll_options` ADD CONSTRAINT `proposal_poll_options_poll_id_proposal_polls_id_fk` FOREIGN KEY (`poll_id`) REFERENCES `proposal_polls`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `proposal_poll_votes` ADD CONSTRAINT `proposal_poll_votes_poll_id_proposal_polls_id_fk` FOREIGN KEY (`poll_id`) REFERENCES `proposal_polls`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `proposal_poll_votes` ADD CONSTRAINT `proposal_poll_votes_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `proposal_poll_votes` ADD CONSTRAINT `proposal_poll_votes_option_id_proposal_poll_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `proposal_poll_options`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `proposal_polls_proposal_idx` ON `proposal_polls` (`proposal_id`);
--> statement-breakpoint
CREATE INDEX `proposal_polls_status_idx` ON `proposal_polls` (`status`,`closes_at`);
--> statement-breakpoint
CREATE INDEX `proposal_poll_options_poll_idx` ON `proposal_poll_options` (`poll_id`);
