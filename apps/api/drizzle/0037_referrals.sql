-- Parrainage (REF-001).
--
-- `players.referral_code` : le code que le joueur partage, créé à la première
-- ouverture de l'écran Parrainage — nul pour tous les comptes existants.
--
-- `referrals` : un filleul, un parrain (index unique sur le filleul), et les
-- dates des deux récompenses — à la première séance UNO League payée du
-- filleul, puis à la cinquième. `cancelled_at` marque un parrainage annulé par
-- l'administration.
--
-- Une colonne nulle et une table neuve, que le code déjà déployé ne lit pas :
-- la migration peut passer avant le déploiement.

ALTER TABLE `players` ADD `referral_code` varchar(16);
--> statement-breakpoint
ALTER TABLE `players` ADD CONSTRAINT `players_referral_code_unique` UNIQUE(`referral_code`);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrer_player_id` int NOT NULL,
	`referred_player_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`first_rewarded_at` datetime(3),
	`milestone_rewarded_at` datetime(3),
	`cancelled_at` datetime(3),
	`cancelled_by_player_id` int,
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrals_referred_unique` UNIQUE(`referred_player_id`)
);
--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrer_player_id_players_id_fk` FOREIGN KEY (`referrer_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referred_player_id_players_id_fk` FOREIGN KEY (`referred_player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_cancelled_by_player_id_players_id_fk` FOREIGN KEY (`cancelled_by_player_id`) REFERENCES `players`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `referrals_referrer_idx` ON `referrals` (`referrer_player_id`);
