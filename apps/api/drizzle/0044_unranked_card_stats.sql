-- Les statistiques de la carte qui ne comptent pas au classement (MODE-002).
--
-- Un match amical fait désormais avancer la carte d'un joueur — ses buts, ses
-- passes, ses défenses, ses arrêts, ses titres d'homme du match — sans toucher
-- au classement, qui reste celui de la UNO League. Les compteurs de carrière
-- (`goals`…) restent ceux du classement ; ces colonnes portent le reste, et
-- la carte additionne les deux.
--
-- Des colonnes ajoutées, à zéro par défaut : le code déjà déployé les ignore,
-- la migration peut passer avant le déploiement.

ALTER TABLE `players` ADD `unranked_goals` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `players` ADD `unranked_assists` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `players` ADD `unranked_defenses` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `players` ADD `unranked_saves` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `players` ADD `unranked_motm` int DEFAULT 0 NOT NULL;
