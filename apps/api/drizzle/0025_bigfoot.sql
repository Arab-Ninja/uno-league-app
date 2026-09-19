-- Mode Grand Foot : football à onze sur gazon, gratuit (MODE-003).
--
-- Deux colonnes et un lieu, c'est tout ce que le mode demande au schéma.
--
-- `proposal_participants.side` porte l'équipe choisie par le joueur. Elle est
-- nullable, et le restera pour tous les autres modes : eux composent les
-- équipes à la clôture, à partir des notes, et laisser choisir d'avance
-- viderait cette répartition de son sens. En Grand Foot, le camp fait partie
-- de l'inscription — on vient jouer avec des gens, pas seulement à une heure.
--
-- `venues.reserved_mode_id` réserve un lieu à un mode. Le gazon de Londerzeel
-- est prêté à la ligue et se joue à onze : le proposer au calendrier d'un
-- amical à cinq n'aurait aucun sens. La réservation se pose sur le lieu et non
-- dans le mode, parce que c'est le lieu qui a une nature, et que
-- l'administration qui en ajoutera d'autres doit pouvoir le dire elle-même.
--
-- Le terrain est inséré ici plutôt que créé à la main : son identifiant, son
-- fuseau et sa réservation doivent être exacts pour que le mode fonctionne, et
-- une faute de frappe dans un écran d'administration se diagnostique mal.

ALTER TABLE `proposal_participants` ADD `side` enum('A','B');--> statement-breakpoint
ALTER TABLE `venues` ADD `reserved_mode_id` varchar(20);
--> statement-breakpoint
INSERT INTO `venues`
  (`slug`, `name`, `headline`, `description`, `address`, `timezone`, `images`,
   `reserved_mode_id`, `active`, `sort_order`)
SELECT
  'londerzeel',
  'Londerzeel',
  'Le gazon du Grand Foot',
  'Terrain de football à onze, en plein air. La ligue en dispose librement : les sessions Grand Foot s''y jouent sans participation.',
  'Blaeuwenhoek 78, 1840 Londerzeel',
  'Europe/Brussels',
  '[]',
  'bigfoot',
  1,
  100
WHERE NOT EXISTS (SELECT 1 FROM `venues` WHERE `slug` = 'londerzeel');
