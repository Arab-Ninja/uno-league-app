-- La formation d'une équipe de séance (PITCH-001).
--
-- Un 1-2-2 ne se joue pas comme un 1-3-1, et imposer la même forme à tout le
-- monde revenait à choisir la tactique à la place des joueurs. La forme se
-- choisit désormais, par n'importe qui de l'équipe, jusqu'au coup d'envoi.
--
-- **La notation est l'identifiant** — « 1-3-1 », « 1-4-4-2 », gardien
-- compris. C'est ce qu'un joueur lit sur une feuille de match, c'est stable,
-- et cela ne se traduit pas : la notation est la même en trois langues. Un
-- `varchar` court plutôt qu'un ENUM, pour la raison écrite en `0028` — TiDB
-- ne convertit pas un ENUM par ALTER TABLE, et le catalogue de formations
-- grandira.
--
-- **`NULL` veut dire « le défaut de cet effectif »**, et non « pas de
-- formation ». C'est ce qui permet à toutes les équipes déjà composées de
-- garder exactement leur terrain : le défaut de chaque effectif est la forme
-- qui se jouait avant ce jour. Personne ne retrouve son équipe redessinée.
--
-- Deux endroits, parce que les équipes naissent à deux moments :
--
--  - `teams`, là où elles sont tirées — la UNO League ;
--  - `proposals`, pour les modes où le camp se choisit (amical, Grand Foot).
--    Il n'y existe pas encore de ligne d'équipe avant la clôture : les deux
--    camps sont A et B, et deux colonnes les disent exactement. Une table de
--    plus aurait porté deux lignes pour deux valeurs connues d'avance.

ALTER TABLE `teams` ADD `formation` varchar(16);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `formation_a` varchar(16);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `formation_b` varchar(16);
