ALTER TABLE `squads` DROP INDEX `squads_name_unique`;--> statement-breakpoint
ALTER TABLE `squads` DROP INDEX `squads_slug_unique`;--> statement-breakpoint
ALTER TABLE `squads` ADD `active_name` varchar(40) GENERATED ALWAYS AS ((CASE WHEN `status` = 'active' THEN `name` END)) STORED;--> statement-breakpoint
ALTER TABLE `squads` ADD `active_slug` varchar(40) GENERATED ALWAYS AS ((CASE WHEN `status` = 'active' THEN `slug` END)) STORED;--> statement-breakpoint
ALTER TABLE `squads` ADD CONSTRAINT `squads_active_name_unique` UNIQUE(`active_name`);--> statement-breakpoint
ALTER TABLE `squads` ADD CONSTRAINT `squads_active_slug_unique` UNIQUE(`active_slug`);