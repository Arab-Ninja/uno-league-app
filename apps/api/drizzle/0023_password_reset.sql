-- Réinitialisation de mot de passe (AUTH-009).
--
-- Jusqu'ici, un joueur qui oubliait son mot de passe était enfermé dehors
-- définitivement : le seul changement possible exigeait de connaître l'ancien,
-- et l'administration elle-même n'avait aucune route pour en poser un nouveau.
-- La seule sortie aurait été une écriture directe en base.
--
-- Le jeton est stocké **haché**, comme celui d'une session : il vaut le compte
-- pendant sa durée de vie, et une fuite de base ne doit pas donner de quoi
-- réinitialiser des comptes.
--
-- `used_at` marque un jeton consommé au lieu de l'effacer : cela distingue
-- « ce lien a déjà servi » de « ce lien n'a jamais existé », deux situations
-- que l'utilisateur vit différemment.
--
-- Aucune unicité sur `user_id` : demander deux fois de suite est normal — le
-- premier courrier tarde, on reclique — et le second jeton n'invalide pas le
-- premier. Un lien qui cesse de fonctionner parce qu'on a recliqué est la
-- meilleure façon d'enfermer quelqu'un dehors pour de bon.

CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_expires_idx` ON `password_reset_tokens` (`expires_at`);
