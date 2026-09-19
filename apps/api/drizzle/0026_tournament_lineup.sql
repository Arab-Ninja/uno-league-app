-- Le cinq d'un club pour un tournoi (TOUR-007).
--
-- Un tournoi ne demandait à personne qui jouait. Le club s'engageait entier,
-- le tableau se tirait, les résultats se saisissaient au score — et le jour
-- venu, on ne savait pas qui devait se présenter. C'est une information de
-- terrain, pas une statistique : elle n'a pas besoin de compter quelque part
-- pour être nécessaire.
--
-- **Attachée à l'engagement, pas au match.** Un club joue un à trois matchs
-- dans la même journée, avec les mêmes cinq : demander une feuille par affiche
-- aurait fait ressaisir trois fois la même chose, et rendu incertain ce qui
-- devait valoir pour la finale. Un club, un tournoi, un cinq.
--
-- **Une ligne par emplacement occupé**, comme pour le terrain d'un club
-- (CLUB-002). Les deux invariants sont alors tenus par la base : un
-- emplacement ne reçoit qu'un joueur, un joueur n'occupe qu'un emplacement.
-- Un emplacement vide n'a pas de ligne : on complète son cinq quand on a les
-- joueurs.
--
-- `cascade` sur l'engagement, `restrict` sur le joueur : un club qui se retire
-- emporte sa feuille — elle ne veut plus rien dire —, mais une feuille ne doit
-- jamais être la raison pour laquelle un joueur disparaît en silence.

CREATE TABLE `tournament_lineups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entry_id` int NOT NULL,
	`slot` enum('GB','DEF','AILE_G','AILE_D','ATT') NOT NULL,
	`player_id` int NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `tournament_lineups_id` PRIMARY KEY(`id`),
	CONSTRAINT `tournament_lineups_slot_unique` UNIQUE(`entry_id`,`slot`),
	CONSTRAINT `tournament_lineups_player_unique` UNIQUE(`entry_id`,`player_id`)
);
--> statement-breakpoint
ALTER TABLE `tournament_lineups` ADD CONSTRAINT `tournament_lineups_entry_id_tournament_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `tournament_entries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_lineups` ADD CONSTRAINT `tournament_lineups_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tournament_lineups_entry_idx` ON `tournament_lineups` (`entry_id`);
