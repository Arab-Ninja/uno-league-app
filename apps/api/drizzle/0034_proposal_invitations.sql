-- Inviter un joueur de l'application à une proposition (CAL-012).
--
-- Partager un lien suffit pour qui n'a pas l'application. Pour un joueur déjà
-- inscrit, on veut mieux : le prévenir directement, et que l'invitation l'attende
-- sur son accueil tant que la séance cherche des joueurs.
--
-- **Une ligne par joueur invité et par proposition** : l'unicité empêche qu'un
-- même joueur soit sollicité deux fois pour la même séance, quel que soit
-- l'invitant. L'index sur (invitant, date) sert la limite quotidienne, qui
-- protège les joueurs des relances en masse.
--
-- `cascade` partout : une proposition supprimée, ou un compte supprimé,
-- emporte ses invitations — elles ne veulent plus rien dire.
--
-- Rien dans le code déjà déployé ne lit cette table : la migration peut passer
-- avant le déploiement.

CREATE TABLE `proposal_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposal_id` int NOT NULL,
	`inviter_player_id` int NOT NULL,
	`invitee_player_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `proposal_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `proposal_invitations_unique` UNIQUE(`proposal_id`,`invitee_player_id`)
);
--> statement-breakpoint
ALTER TABLE `proposal_invitations` ADD CONSTRAINT `proposal_invitations_proposal_id_proposals_id_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_invitations` ADD CONSTRAINT `proposal_invitations_inviter_player_id_players_id_fk` FOREIGN KEY (`inviter_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_invitations` ADD CONSTRAINT `proposal_invitations_invitee_player_id_players_id_fk` FOREIGN KEY (`invitee_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `proposal_invitations_invitee_idx` ON `proposal_invitations` (`invitee_player_id`);--> statement-breakpoint
CREATE INDEX `proposal_invitations_inviter_idx` ON `proposal_invitations` (`inviter_player_id`,`created_at`);
