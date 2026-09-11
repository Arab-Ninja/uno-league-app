-- Le nom d'un SQUAD n'est réservé que tant qu'il vit (SQUAD-002).
--
-- L'unicité portait sur `name` et `slug` sans condition : un club dissous
-- gardait son nom à jamais, alors qu'il n'apparaît plus nulle part et qu'on ne
-- peut ni le rejoindre ni le défier. Elle porte désormais sur deux colonnes
-- générées, nulles une fois le club dissous — et MySQL n'oppose pas deux NULL
-- dans un index unique.
--
-- **Chaque instruction est rejouable.** MySQL valide le DDL immédiatement :
-- une migration interrompue en cours de route laisse les instructions déjà
-- passées appliquées, et la relancer échouerait sur la première. Les gardes
-- ci-dessous rendent l'ensemble sûr à rejouer depuis n'importe quel état
-- intermédiaire.

SET @drop_name := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND index_name = 'squads_name_unique') > 0,
  'ALTER TABLE `squads` DROP INDEX `squads_name_unique`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @drop_name;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @drop_slug := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND index_name = 'squads_slug_unique') > 0,
  'ALTER TABLE `squads` DROP INDEX `squads_slug_unique`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @drop_slug;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @add_name := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND column_name = 'active_name') = 0,
  'ALTER TABLE `squads` ADD `active_name` varchar(40) GENERATED ALWAYS AS ((CASE WHEN `status` = ''active'' THEN `name` END)) STORED',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @add_name;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @add_slug := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND column_name = 'active_slug') = 0,
  'ALTER TABLE `squads` ADD `active_slug` varchar(40) GENERATED ALWAYS AS ((CASE WHEN `status` = ''active'' THEN `slug` END)) STORED',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @add_slug;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @uniq_name := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND index_name = 'squads_active_name_unique') = 0,
  'ALTER TABLE `squads` ADD CONSTRAINT `squads_active_name_unique` UNIQUE(`active_name`)',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @uniq_name;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @uniq_slug := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND index_name = 'squads_active_slug_unique') = 0,
  'ALTER TABLE `squads` ADD CONSTRAINT `squads_active_slug_unique` UNIQUE(`active_slug`)',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @uniq_slug;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;
