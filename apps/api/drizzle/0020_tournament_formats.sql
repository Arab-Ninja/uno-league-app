-- Formats de tournoi, et le lien entre un tournoi et son format (TOUR-005).
--
-- Les trois contraintes CHECK sont posées dans le CREATE TABLE, jamais par un
-- ALTER TABLE : TiDB refuse la seconde forme (DECISIONS §40).

CREATE TABLE `tournament_formats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`size` int NOT NULL,
	`entry_fee_uno` int NOT NULL DEFAULT 0,
	`prize_uno` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `tournament_formats_id` PRIMARY KEY(`id`),
	CONSTRAINT `tournament_formats_size_allowed` CHECK(`tournament_formats`.`size` IN (4, 8, 16, 32)),
	CONSTRAINT `tournament_formats_fee_non_negative` CHECK(`tournament_formats`.`entry_fee_uno` >= 0),
	CONSTRAINT `tournament_formats_prize_non_negative` CHECK(`tournament_formats`.`prize_uno` >= 0)
);
--> statement-breakpoint
ALTER TABLE `tournaments` ADD `format_id` int;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `proposed_by_squad_id` int;--> statement-breakpoint
CREATE INDEX `tournament_formats_active_idx` ON `tournament_formats` (`active`,`size`);