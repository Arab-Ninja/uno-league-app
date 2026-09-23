-- « Grand Foot » s'appelle désormais « Football » (MODE-003).
--
-- Le nom du mode vit dans le code et se traduit à l'écran ; mais le terrain de
-- Londerzeel, inséré par la migration 0025, le porte aussi dans ses textes, et
-- ceux-là sont des données. Ils se corrigent ici.
--
-- **Seulement s'ils n'ont pas bougé.** Les lieux sont administrables : si
-- quelqu'un a déjà réécrit l'accroche ou la description depuis la console, sa
-- version l'emporte. La condition porte sur le texte d'origine exact, si bien
-- que la migration ne remplace que ce qu'elle a elle-même écrit.
--
-- Rien dans le code n'en dépend : elle peut passer avant ou après le
-- déploiement, sans ordre à respecter.

UPDATE `venues`
SET `headline` = 'Le gazon du football à onze'
WHERE `slug` = 'londerzeel' AND `headline` = 'Le gazon du Grand Foot';
--> statement-breakpoint
UPDATE `venues`
SET `description` = 'Terrain de football à onze, en plein air. La ligue en dispose librement : les séances Football s''y jouent sans participation.'
WHERE `slug` = 'londerzeel'
  AND `description` = 'Terrain de football à onze, en plein air. La ligue en dispose librement : les sessions Grand Foot s''y jouent sans participation.';
