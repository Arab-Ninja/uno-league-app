-- Réparation : `squads.active_name` / `active_slug` deviennent des colonnes
-- ordinaires (SQUAD-002).
--
-- La migration 0011 les a d'abord introduites comme colonnes **générées
-- stockées**. MySQL l'accepte, TiDB non : `ALTER TABLE ... ADD ... GENERATED
-- ALWAYS AS (...) STORED` y échoue avec l'erreur 3106
-- (ER_UNSUPPORTED_ACTION_ON_GENERATED_COLUMN). 0011 a donc été réécrite avec
-- des colonnes ordinaires, mais une base qui avait déjà appliqué l'ancienne
-- version ne la rejouera pas : drizzle ne rejoue jamais une migration passée.
-- C'est le rôle de celle-ci — et sur une base créée par la 0011 réécrite,
-- elle ne fait rien.
--
-- Une colonne générée refuse toute écriture explicite : sans cette
-- conversion, la création d'un club échouerait sur ces bases-là.

SET @drop_gen_name := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND column_name = 'active_name' AND extra LIKE '%GENERATED%') > 0,
  'ALTER TABLE `squads` DROP COLUMN `active_name`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @drop_gen_name;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @drop_gen_slug := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND column_name = 'active_slug' AND extra LIKE '%GENERATED%') > 0,
  'ALTER TABLE `squads` DROP COLUMN `active_slug`',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @drop_gen_slug;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @add_name := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND column_name = 'active_name') = 0,
  'ALTER TABLE `squads` ADD `active_name` varchar(40)',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @add_name;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

SET @add_slug := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'squads'
     AND column_name = 'active_slug') = 0,
  'ALTER TABLE `squads` ADD `active_slug` varchar(40)',
  'DO 0'
);--> statement-breakpoint
PREPARE stmt FROM @add_slug;--> statement-breakpoint
EXECUTE stmt;--> statement-breakpoint
DEALLOCATE PREPARE stmt;--> statement-breakpoint

-- Les valeurs que la colonne générée calculait, désormais posées une fois.
UPDATE `squads`
SET `active_name` = CASE WHEN `status` = 'active' THEN `name` END,
    `active_slug` = CASE WHEN `status` = 'active' THEN `slug` END;--> statement-breakpoint

-- Supprimer une colonne emporte l'index unique qui ne portait que sur elle.
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
