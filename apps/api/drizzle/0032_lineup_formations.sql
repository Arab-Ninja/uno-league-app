-- La forme du terrain se choisit aussi pour un club et pour un tournoi
-- (CLUB-003).
--
-- **Pourquoi cette migration réécrit des lignes au lieu d'ajouter une
-- colonne.** Les deux feuilles rangeaient leur emplacement dans une
-- énumération SQL de cinq valeurs — GB, DEF, AILE_G, AILE_D, ATT —, c'est-à-
-- dire le losange du futsal figé dans le schéma. TiDB ne convertit pas une
-- énumération par ALTER TABLE ; et la garder à côté d'une colonne moderne
-- était impossible autrement : elle est NOT NULL et porte un index unique,
-- si bien qu'un 1-2-2 avec ses deux défenseurs aurait écrit deux fois « DEF »
-- et violé cet index.
--
-- L'emplacement devient donc une chaîne du catalogue partagé — `GB`, `DEF1`,
-- `MIL2`, `ATT1` —, la même que sur le terrain d'une séance. La conversion
-- est sans perte : le losange d'origine est exactement le 1-1-2-1 du
-- catalogue, et chacune des cinq valeurs a son équivalent.
--
-- L'ordre compte. L'index unique porte sur (parent, slot) : le supprimer
-- avant la colonne évite que MySQL ne le réduise silencieusement à (parent),
-- ce qui limiterait chaque club à une seule ligne de composition.

ALTER TABLE `squads` ADD `formation` varchar(16);
--> statement-breakpoint
ALTER TABLE `tournament_entries` ADD `formation` varchar(16);
--> statement-breakpoint
ALTER TABLE `squad_lineups` ADD `pitch_slot` varchar(8);
--> statement-breakpoint
UPDATE `squad_lineups` SET `pitch_slot` = CASE `slot`
  WHEN 'GB' THEN 'GB'
  WHEN 'DEF' THEN 'DEF1'
  WHEN 'AILE_G' THEN 'MIL1'
  WHEN 'AILE_D' THEN 'MIL2'
  WHEN 'ATT' THEN 'ATT1'
END;
--> statement-breakpoint
ALTER TABLE `squad_lineups` DROP INDEX `squad_lineups_slot_unique`;
--> statement-breakpoint
ALTER TABLE `squad_lineups` DROP COLUMN `slot`;
--> statement-breakpoint
CREATE UNIQUE INDEX `squad_lineups_slot_unique` ON `squad_lineups` (`squad_id`,`pitch_slot`);
--> statement-breakpoint
ALTER TABLE `tournament_lineups` ADD `pitch_slot` varchar(8);
--> statement-breakpoint
UPDATE `tournament_lineups` SET `pitch_slot` = CASE `slot`
  WHEN 'GB' THEN 'GB'
  WHEN 'DEF' THEN 'DEF1'
  WHEN 'AILE_G' THEN 'MIL1'
  WHEN 'AILE_D' THEN 'MIL2'
  WHEN 'ATT' THEN 'ATT1'
END;
--> statement-breakpoint
ALTER TABLE `tournament_lineups` DROP INDEX `tournament_lineups_slot_unique`;
--> statement-breakpoint
ALTER TABLE `tournament_lineups` DROP COLUMN `slot`;
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_lineups_slot_unique` ON `tournament_lineups` (`entry_id`,`pitch_slot`);
