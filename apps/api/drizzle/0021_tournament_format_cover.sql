-- L'affiche d'un format de tournoi (TOUR-006).
--
-- Nullable et sans contrainte : un format sans couverture reste parfaitement
-- utilisable, le calendrier lui dessine une tuile de repli.

ALTER TABLE `tournament_formats` ADD `cover_image_url` varchar(2048);
