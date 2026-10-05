-- Annonces illustrées (ANN-005).
--
-- Une colonne JSON nullable plutôt qu'une table d'images : comme pour les
-- produits et les salles, les photos d'une annonce n'ont pas de vie propre,
-- elles s'affichent dans l'ordre où l'administration les a posées. NULL vaut
-- « aucune image » pour les annonces écrites avant.
ALTER TABLE `announcements` ADD `images` json;
