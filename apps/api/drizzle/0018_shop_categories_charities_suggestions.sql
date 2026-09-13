-- Boutique : catégories ouvertes, associations caritatives, suggestions de
-- produits (SHOP-007, SHOP-008, SHOP-009).

CREATE TABLE `charities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`image_url` varchar(2048),
	`website_url` varchar(2048) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `charities_id` PRIMARY KEY(`id`),
	CONSTRAINT `charities_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `shop_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_id` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`url` varchar(2048) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`decision_note` text,
	`decided_by` int,
	`decided_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shop_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `charity_id` int;--> statement-breakpoint
ALTER TABLE `order_items` ADD `charity_name_snapshot` varchar(120);--> statement-breakpoint
ALTER TABLE `shop_suggestions` ADD CONSTRAINT `shop_suggestions_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shop_suggestions` ADD CONSTRAINT `shop_suggestions_decided_by_users_id_fk` FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `charities_active_idx` ON `charities` (`active`,`name`);--> statement-breakpoint
CREATE INDEX `shop_suggestions_status_idx` ON `shop_suggestions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `shop_suggestions_player_idx` ON `shop_suggestions` (`player_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_charity_id_charities_id_fk` FOREIGN KEY (`charity_id`) REFERENCES `charities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_items_charity_idx` ON `order_items` (`charity_id`);--> statement-breakpoint

-- `shop_items.category` : ENUM -> VARCHAR(30).
--
-- drizzle-kit propose ici `ALTER TABLE ... MODIFY COLUMN category varchar(30)`.
-- MySQL l'accepte ; TiDB documente l'inverse : « changing from some data types
-- (for example, TIME, BIT, SET, ENUM, and JSON) to some other types is not
-- supported ». Même leçon que la 0011 (DECISIONS §40) : la migration est donc
-- écrite avec les seules opérations que les deux moteurs tiennent — ajout,
-- recopie, suppression, renommage — jamais une conversion de type sur un ENUM.
--
-- Chaque étape est gardée : une base où la conversion est déjà faite traverse
-- le fichier sans rien changer.
SET @cat_is_enum := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'shop_items'
    AND column_name = 'category' AND data_type = 'enum'
);--> statement-breakpoint

-- L'index porte sur la colonne qui va disparaître : il est refait à la fin.
SET @sql := IF(
  @cat_is_enum > 0
    AND (SELECT COUNT(*) FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'shop_items'
           AND index_name = 'shop_items_category_idx') > 0,
  'DROP INDEX `shop_items_category_idx` ON `shop_items`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @sql;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @sql := IF(
  @cat_is_enum > 0,
  'ALTER TABLE `shop_items` ADD `category_text` varchar(30) NOT NULL DEFAULT ''other''',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @sql;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @sql := IF(
  @cat_is_enum > 0,
  'UPDATE `shop_items` SET `category_text` = `category`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @sql;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @sql := IF(
  @cat_is_enum > 0,
  'ALTER TABLE `shop_items` DROP COLUMN `category`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @sql;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

-- Renommage à type constant : changement de métadonnées, accepté par les deux
-- moteurs. La valeur par défaut, utile le temps de la recopie, tombe ici.
SET @sql := IF(
  @cat_is_enum > 0,
  'ALTER TABLE `shop_items` CHANGE `category_text` `category` varchar(30) NOT NULL',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @sql;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'shop_items'
     AND index_name = 'shop_items_category_idx') = 0,
  'CREATE INDEX `shop_items_category_idx` ON `shop_items` (`category`)',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @sql;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;
