-- Inviter des joueurs dans son club (CLUB-004).
--
-- Jusqu'ici, on n'entrait dans un club qu'en le demandant. Le club peut
-- désormais inviter : un joueur de l'application, nommément, ou n'importe qui
-- par un lien à partager. Une table neuve, que rien d'existant ne lit : le
-- code déjà déployé l'ignore, la migration peut passer avant le déploiement.

CREATE TABLE `squad_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squad_id` int NOT NULL,
	`invitee_player_id` int,
	`inviter_player_id` int NOT NULL,
	`token` varchar(64),
	`status` enum('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`decided_at` datetime(3),
	`pending_squad_id` int GENERATED ALWAYS AS ((CASE WHEN `status` = 'pending' THEN `squad_id` END)) STORED,
	`pending_invitee_id` int GENERATED ALWAYS AS ((CASE WHEN `status` = 'pending' THEN `invitee_player_id` END)) STORED,
	CONSTRAINT `squad_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_invitations_pending_unique` UNIQUE(`pending_squad_id`,`pending_invitee_id`),
	CONSTRAINT `squad_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `squad_invitations` ADD CONSTRAINT `squad_invitations_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `squad_invitations` ADD CONSTRAINT `squad_invitations_invitee_player_id_players_id_fk` FOREIGN KEY (`invitee_player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `squad_invitations` ADD CONSTRAINT `squad_invitations_inviter_player_id_players_id_fk` FOREIGN KEY (`inviter_player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `squad_invitations_squad_idx` ON `squad_invitations` (`squad_id`,`status`);
--> statement-breakpoint
CREATE INDEX `squad_invitations_invitee_idx` ON `squad_invitations` (`invitee_player_id`,`status`);
