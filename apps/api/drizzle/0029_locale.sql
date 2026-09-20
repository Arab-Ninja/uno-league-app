-- La langue d'un joueur (I18N-001).
--
-- **Sur le compte, pas sur l'appareil.** La langue du téléphone convient pour
-- un premier écran, mais elle ne sert à rien au moment d'envoyer un courriel :
-- l'expédition a lieu sur le serveur, des heures après, sans appareil en face.
-- Un joueur qui lit l'app en néerlandais doit recevoir ses rappels de paiement
-- en néerlandais. La langue se range donc à côté de `push_enabled`, avec les
-- autres préférences du joueur.
--
-- Deux caractères, pas un ENUM : ajouter une langue ne doit pas demander une
-- migration de recopie, et TiDB ne convertit pas un ENUM par ALTER TABLE.
--
-- Le français est la valeur par défaut parce que c'est la langue de référence
-- de la ligue : les clés manquantes y retombent.

ALTER TABLE `players` ADD `locale` varchar(2) NOT NULL DEFAULT 'fr';
