-- Modération des contenus publiés par les joueurs (MOD-001).
--
-- Les stores exigent d'une application où l'on écrit pour les autres de pouvoir
-- signaler un contenu et bloquer son auteur (App Store Review Guidelines 1.2).
--
-- `content_reports` : un signalement par joueur et par contenu (index unique).
-- Pas de clé étrangère vers la cible, qui varie selon le genre ; l'extrait est
-- recopié au moment du signalement, pour que l'administration sache encore
-- pourquoi elle a agi une fois le contenu retiré. Des chaînes et non des ENUM :
-- TiDB ne modifie pas un ENUM par ALTER TABLE.
--
-- `player_blocks` : un blocage par paire de joueurs.
--
-- Deux tables neuves, que le code déjà déployé ne lit pas : la migration peut
-- passer avant le déploiement.

CREATE TABLE `content_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporter_player_id` int NOT NULL,
	`kind` varchar(10) NOT NULL,
	`target_id` int NOT NULL,
	`reported_player_id` int,
	`reason` varchar(20) NOT NULL,
	`details` varchar(500),
	`excerpt` varchar(300),
	`status` varchar(10) NOT NULL DEFAULT 'open',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`resolved_at` datetime(3),
	`resolved_by_player_id` int,
	CONSTRAINT `content_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_reports_unique` UNIQUE(`reporter_player_id`,`kind`,`target_id`)
);
--> statement-breakpoint
CREATE TABLE `player_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blocker_player_id` int NOT NULL,
	`blocked_player_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `player_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_blocks_unique` UNIQUE(`blocker_player_id`,`blocked_player_id`)
);
--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_reporter_player_id_players_id_fk` FOREIGN KEY (`reporter_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_reported_player_id_players_id_fk` FOREIGN KEY (`reported_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_resolved_by_player_id_players_id_fk` FOREIGN KEY (`resolved_by_player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_blocks` ADD CONSTRAINT `player_blocks_blocker_player_id_players_id_fk` FOREIGN KEY (`blocker_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_blocks` ADD CONSTRAINT `player_blocks_blocked_player_id_players_id_fk` FOREIGN KEY (`blocked_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `player_blocks_blocked_idx` ON `player_blocks` (`blocked_player_id`);
