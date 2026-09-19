-- La composition que le club s'est choisie (CLUB-002).
--
-- Le terrain n'était jusqu'ici qu'une déduction : le meilleur buteur à la
-- pointe, le meilleur passeur sur une aile. C'est juste pour décrire un
-- effectif, et faux pour aligner une équipe — un entraîneur ne choisit pas
-- ses cinq à la statistique.
--
-- **Une ligne par emplacement occupé**, et non cinq colonnes sur une ligne
-- unique. Les deux invariants sont alors tenus par la base : un emplacement
-- ne reçoit qu'un joueur, un joueur n'occupe qu'un emplacement. En colonnes,
-- il aurait fallu les vérifier à la main à chaque écriture, et les oublier
-- une fois aurait suffi à aligner le même joueur deux fois.
--
-- Un emplacement vide n'a pas de ligne : une composition partielle est
-- valable, on complète son cinq quand on a les joueurs.
--
-- `restrict` des deux côtés, comme partout dans le modèle des clubs : une
-- composition ne doit jamais être la raison pour laquelle un club ou un
-- joueur disparaît en silence.

CREATE TABLE `squad_lineups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squad_id` int NOT NULL,
	`slot` enum('GB','DEF','AILE_G','AILE_D','ATT') NOT NULL,
	`player_id` int NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `squad_lineups_id` PRIMARY KEY(`id`),
	CONSTRAINT `squad_lineups_slot_unique` UNIQUE(`squad_id`,`slot`),
	CONSTRAINT `squad_lineups_player_unique` UNIQUE(`squad_id`,`player_id`)
);
--> statement-breakpoint
ALTER TABLE `squad_lineups` ADD CONSTRAINT `squad_lineups_squad_id_squads_id_fk` FOREIGN KEY (`squad_id`) REFERENCES `squads`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `squad_lineups` ADD CONSTRAINT `squad_lineups_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `squad_lineups_squad_idx` ON `squad_lineups` (`squad_id`);