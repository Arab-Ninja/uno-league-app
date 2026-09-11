-- Note de carte évolutive (CARD-002).
--
-- La note était dérivée du total de carrière : elle ne pouvait donc que
-- monter. Elle devient une valeur stockée, déplacée à chaque session selon
-- que le joueur a fait mieux ou moins bien qu'à la précédente.

ALTER TABLE `players` ADD `rating` int DEFAULT 50 NOT NULL;--> statement-breakpoint

-- Les cartes existantes gardent la note qu'elles affichaient hier : on rejoue
-- ici la formule dérivée, une dernière fois, comme point de départ. Sans cela
-- toute la ligue retomberait à 50 le jour de la migration.
--
--   note = 50 + 49 × (1 − e^(−points / 90)),  points = 1,5×buts + 1×passes
--                                                    + 0,5×défenses + 0,5×arrêts
UPDATE `players`
SET `rating` = LEAST(99, GREATEST(50, ROUND(
  50 + 49 * (1 - EXP(-(
    1.5 * `goals` + 1.0 * `assists` + 0.5 * `defenses` + 0.5 * `saves`
  ) / 90))
)));--> statement-breakpoint

ALTER TABLE `players` ADD CONSTRAINT `players_rating_range` CHECK (`players`.`rating` BETWEEN 50 AND 99);--> statement-breakpoint

-- Trace du déplacement, session par session : l'historique affiche la note
-- obtenue, et une correction sait exactement quel écart défaire.
ALTER TABLE `proposal_participants` ADD `rating_before` int;--> statement-breakpoint
ALTER TABLE `proposal_participants` ADD `rating_after` int;
