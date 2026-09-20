-- On choisit son équipe en UNO League (MODE-005).
--
-- Les trois équipes existent désormais dès la proposition : elles accueillent
-- les joueurs au fur et à mesure, et la clôture ne fait plus que répartir
-- ceux qui n'ont rien choisi. Le schéma n'a qu'une chose à apprendre — la
-- différence entre les deux.
--
-- `team_members.chosen` dit si la place vient du joueur ou du tirage. Sans
-- elle, une séance qui repasse sous le quota — un départ sans remplaçant —
-- effacerait la composition entière, y compris les équipes que des joueurs
-- avaient formées des jours plus tôt. La colonne permet de ne rendre que ce
-- que le tirage avait donné.
--
-- Les propositions de UNO League déjà ouvertes reçoivent leurs trois équipes
-- ici : sans cela, elles resteraient jusqu'à leur clôture les seules où le
-- choix n'existe pas, sans que rien ne l'explique au joueur. `INSERT IGNORE`
-- rend l'opération rejouable — la seule erreur qu'il puisse taire est le
-- doublon que l'index unique refuse déjà.

ALTER TABLE `team_members` ADD `chosen` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT IGNORE INTO `teams` (`proposal_id`, `name`, `team_index`)
SELECT p.`id`, 'Équipe A', 0 FROM `proposals` p
WHERE p.`mode_id` = 'league' AND p.`status` = 'proposal';
--> statement-breakpoint
INSERT IGNORE INTO `teams` (`proposal_id`, `name`, `team_index`)
SELECT p.`id`, 'Équipe B', 1 FROM `proposals` p
WHERE p.`mode_id` = 'league' AND p.`status` = 'proposal';
--> statement-breakpoint
INSERT IGNORE INTO `teams` (`proposal_id`, `name`, `team_index`)
SELECT p.`id`, 'Équipe C', 2 FROM `proposals` p
WHERE p.`mode_id` = 'league' AND p.`status` = 'proposal';
