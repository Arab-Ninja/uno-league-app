-- La place d'un joueur sur le terrain de Grand Foot (MODE-003).
--
-- Le camp ne suffisait pas. Un joueur qui s'inscrit choisissait son équipe,
-- mais pas ce qu'il venait y faire — et dix personnes qui arrivent sans savoir
-- qui garde les buts perdent un quart d'heure à se le demander.
--
-- **Une colonne, pas une table.** Un participant occupe au plus une place, et
-- il a déjà sa ligne : une table séparée aurait dupliqué la clé pour n'ajouter
-- qu'un mot. `NULL` est l'état normal — partout ailleurs qu'en Grand Foot, et
-- en Grand Foot tant que le joueur ne s'est pas placé.
--
-- L'identifiant de place est une chaîne courte (`GB`, `DEF3`, `MIL2`, `ATT1`)
-- plutôt qu'un ENUM : la formation dépend de l'effectif, qui va de sept à onze
-- par équipe, et TiDB ne convertit pas un ENUM par ALTER TABLE. Ajouter un
-- format aurait alors demandé une migration de recopie. La liste des places
-- valables vit dans le code partagé, qui la vérifie des deux côtés.
--
-- L'unicité porte sur (proposition, camp, place) : deux joueurs ne gardent pas
-- les mêmes buts. Plusieurs `NULL` restent permis par la même clé — c'est
-- exactement ce qu'il faut, puisque les joueurs non placés sont nombreux.

ALTER TABLE `proposal_participants` ADD `pitch_slot` varchar(8);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_participants_pitch_slot_unique` ON `proposal_participants` (`proposal_id`,`side`,`pitch_slot`);
