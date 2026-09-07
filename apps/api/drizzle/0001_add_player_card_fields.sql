ALTER TABLE `players` ADD `position` enum('GB','DEF','MIL','ATT') DEFAULT 'MIL' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `matches_played` int DEFAULT 0 NOT NULL;