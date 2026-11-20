-- Les vidéos d'une séance déposées sur le stockage de la ligue (SUP-004).
--
-- Jusqu'ici une vidéo n'était qu'un lien vers un hébergeur. Elle peut
-- désormais être un fichier, dans un bucket privé : `object_key` le désigne,
-- et l'adresse de lecture est signée à chaque demande, pour les seuls joueurs
-- de la séance. `role` dit s'il s'agit du match complet ou du résumé ;
-- `moments` porte ses moments-clés.
--
-- Des colonnes ajoutées, toutes facultatives : le code déjà déployé les
-- ignore, la migration peut passer avant le déploiement.

ALTER TABLE `session_videos` ADD `object_key` varchar(512);
--> statement-breakpoint
ALTER TABLE `session_videos` ADD `role` varchar(16);
--> statement-breakpoint
ALTER TABLE `session_videos` ADD `bytes` bigint;
--> statement-breakpoint
ALTER TABLE `session_videos` ADD `moments` json;
