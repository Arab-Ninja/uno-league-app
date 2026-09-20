-- La place d'un joueur dans son équipe de session (MODE-004).
--
-- En UNO League, on ne choisit ni ses coéquipiers ni son camp : les trois
-- équipes sont tirées par chapeaux, et c'est ce qui fait la valeur du
-- classement. Mais rien n'obligeait à ce que le poste soit imposé aussi. Une
-- fois l'équipe connue, chacun dit ce qu'il vient y jouer.
--
-- **Sur l'appartenance, pas sur le participant.** Un joueur appartient à une
-- équipe d'une session ; c'est là que sa place a un sens. La poser sur
-- `proposal_participants` aurait obligé à porter l'unicité par équipe dans
-- une table qui ne connaît pas les équipes.
--
-- Même vocabulaire que le terrain du Grand Foot : une chaîne courte (`GB`,
-- `DEF1`, `MIL2`, `ATT1`) plutôt qu'un ENUM, pour que la formation puisse
-- changer sans migration de recopie — TiDB ne convertit pas un ENUM par
-- ALTER TABLE.
--
-- L'unicité porte sur (équipe, place) : deux joueurs de la même équipe ne
-- gardent pas les mêmes buts. Les `NULL` multiples que cette clé autorise
-- sont exactement ce qu'il faut — on peut jouer sans avoir choisi de poste,
-- et c'est l'état de départ de tout le monde.

ALTER TABLE `team_members` ADD `pitch_slot` varchar(8);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_pitch_slot_unique` ON `team_members` (`team_id`,`pitch_slot`);
