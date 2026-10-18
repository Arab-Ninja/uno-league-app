-- Notifications réglables (NOTIF-001 à NOTIF-004).
--
-- `players.notification_settings` : ce que le joueur a changé à ses
-- notifications, en JSON ; nul pour tous les comptes existants, qui gardent
-- les défauts. `email_opt_out_at` : désinscription des e-mails.
-- `push_prompted_at` / `push_reminded_at` : la proposition d'activer le push,
-- vue puis relancée.
--
-- `notification_deliveries.category` et `.url` : la catégorie et l'écran
-- qu'ouvre une notification ; nuls pour l'historique. `push_deferred_at` : un
-- push retenu pendant les heures calmes.
--
-- `proposals.announced_at` : la séance annoncée aux joueurs qui peuvent la
-- rejoindre. Les séances existantes sont marquées annoncées, pour qu'aucune ne
-- soit annoncée en bloc au déploiement.
--
-- Des colonnes nulles que le code déjà déployé ne lit pas : la migration peut
-- passer avant le déploiement.

ALTER TABLE `players` ADD `notification_settings` json;
--> statement-breakpoint
ALTER TABLE `players` ADD `email_opt_out_at` datetime(3);
--> statement-breakpoint
ALTER TABLE `players` ADD `push_prompted_at` datetime(3);
--> statement-breakpoint
ALTER TABLE `players` ADD `push_reminded_at` datetime(3);
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `category` varchar(20);
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `url` varchar(200);
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `push_deferred_at` datetime(3);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_deferred_idx` ON `notification_deliveries` (`push_deferred_at`);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `announced_at` datetime(3);
--> statement-breakpoint
UPDATE `proposals` SET `announced_at` = CURRENT_TIMESTAMP(3) WHERE `announced_at` IS NULL;
