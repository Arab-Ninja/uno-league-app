-- Une invitation par invité et par invitant (CAL-014).
--
-- L'unicité (séance, invité) réservait l'invitation au premier inscrit qui la
-- faisait : les suivants ne pouvaient plus inviter le même ami. Elle devient
-- (séance, invité, invitant).
--
-- La nouvelle unicité est créée AVANT de retirer l'ancienne : la clé
-- étrangère sur `proposal_id` doit toujours trouver un index qui commence par
-- cette colonne. Le code déjà déployé fonctionne avec l'une comme avec
-- l'autre : la migration peut passer avant le déploiement.

CREATE UNIQUE INDEX `proposal_invitations_inviter_unique` ON `proposal_invitations` (`proposal_id`,`invitee_player_id`,`inviter_player_id`);
--> statement-breakpoint
ALTER TABLE `proposal_invitations` DROP INDEX `proposal_invitations_unique`;
