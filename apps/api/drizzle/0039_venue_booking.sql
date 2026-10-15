-- Réservation des terrains (VENUE-001).
--
-- `venues.booking_url` : la page où se réserve le terrain de la salle, chez
-- l'exploitant (SportFinders pour les centres five). Nulle pour les salles
-- existantes, que l'administration complète à son rythme.
--
-- `proposals.venue_booked_at` : l'instant où l'administration a déclaré le
-- terrain réservé. Nul pour toutes les propositions existantes, y compris
-- celles dont le terrain est déjà réservé : l'administration le coche.
--
-- Deux colonnes nulles que le code déjà déployé ne lit pas : la migration peut
-- passer avant le déploiement.

ALTER TABLE `venues` ADD `booking_url` varchar(500);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `venue_booked_at` datetime(3);
