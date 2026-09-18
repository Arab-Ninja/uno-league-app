-- Par quelle route on atteint un appareil (ANN-005).
--
-- Le Web Push ne fonctionne que dans un navigateur : ni la WebView Android ni
-- WKWebView n'exposent l'API Push, si bien qu'une application installée depuis
-- un store ne recevait aucune notification système. Firebase Cloud Messaging
-- devient la seconde route, et cette colonne dit laquelle emprunter.
--
-- Elle ne se déduit pas de `platform` : Chrome sur Android annonce « android »
-- pour un abonnement parfaitement web. La plateforme dit sur quoi tourne
-- l'appareil, le transport dit comment le joindre.
--
-- Le défaut vaut `webpush` : toutes les lignes existantes sont des abonnements
-- de navigateur.

ALTER TABLE `device_tokens` ADD `transport` enum('webpush','fcm') NOT NULL DEFAULT 'webpush';
