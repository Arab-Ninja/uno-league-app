-- Séances privées et match personnalisé (PRIV-001, PRIV-002, PRIV-003).
--
-- `proposals.visibility` : `public` (ce qui existait) ou `private`. Une chaîne
-- et non un ENUM, parce que TiDB ne convertit pas un ENUM par ALTER TABLE. La
-- valeur par défaut est un littéral, que TiDB accepte, et elle donne aux
-- propositions existantes exactement leur comportement d'avant.
--
-- `proposals.invite_token` : le jeton du lien d'invitation d'une séance
-- privée ; NULL pour une séance publique.
--
-- `proposals.custom_details` : l'adresse, la durée et le prix affiché d'un
-- match personnalisé ; NULL pour toute autre séance. Colonne JSON nullable,
-- sans valeur par défaut — TiDB n'en accepte pas sur une colonne JSON.
--
-- `proposal_invitations.status` et `responded_at` : la réponse de l'invité.
-- Les invitations déjà envoyées passent en `pending`, ce qu'elles étaient.
--
-- Le code déjà déployé ne lit aucune de ces colonnes et n'écrit que dans des
-- tables où elles ont une valeur par défaut : la migration peut passer avant
-- le déploiement.

ALTER TABLE `proposals` ADD `visibility` varchar(10) NOT NULL DEFAULT 'public';--> statement-breakpoint
ALTER TABLE `proposals` ADD `invite_token` varchar(64);--> statement-breakpoint
ALTER TABLE `proposals` ADD `custom_details` json;--> statement-breakpoint
ALTER TABLE `proposal_invitations` ADD `status` varchar(10) NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `proposal_invitations` ADD `responded_at` datetime(3);
