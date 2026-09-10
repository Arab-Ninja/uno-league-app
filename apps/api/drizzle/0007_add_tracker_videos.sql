CREATE TABLE `stat_session_videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`label` varchar(80) NOT NULL,
	`url` varchar(2048),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stat_session_videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stat_matches` ADD `video_id` int;--> statement-breakpoint
ALTER TABLE `stat_session_videos` ADD CONSTRAINT `stat_session_videos_session_id_stat_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `stat_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `stat_session_videos_session_idx` ON `stat_session_videos` (`session_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `stat_matches` ADD CONSTRAINT `stat_matches_video_id_stat_session_videos_id_fk` FOREIGN KEY (`video_id`) REFERENCES `stat_session_videos`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO `stat_session_videos` (`session_id`, `label`, `url`, `sort_order`)
	SELECT `id`, 'Enregistrement', `video_url`, 0
	FROM `stat_sessions`
	WHERE `video_url` IS NOT NULL AND `video_url` <> '';--> statement-breakpoint
ALTER TABLE `stat_sessions` DROP COLUMN `video_url`;