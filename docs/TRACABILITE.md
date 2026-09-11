# Traçabilité des exigences

Correspondance entre les exigences du cahier des charges et leur
implémentation. Les tests cités s'exécutent avec `pnpm test`.

## Principes directeurs (§1)

| Exigence | Implémentation |
|---|---|
| P-001 mobile portrait 375–430 px | `apps/web/src/components/layout` — colonne de 520 px max, safe areas |
| P-002 aucun écran sans issue | `Screen` : repli `backTo` quand l'historique est vide ; barre d'onglets sur la console | vérifié en navigateur |
| P-003 règles métier côté serveur | `apps/api/src/services/*` ; aucune règle dans `apps/web` |
| P-004 données issues du serveur | classement, soldes et prix calculés en base ; le client n'ordonne rien |
| P-005 le document prime | écarts consignés dans `docs/DECISIONS.md` |

## Rôles et droits (§3)

| Exigence | Implémentation | Test |
|---|---|---|
| ROLE-001 autorisation serveur | `trpc/init.ts` — `adminProcedure` relit `users.role` en base | `competition.test.ts` E2E-012 |
| ROLE-002 isolation des données | `orders.service.ts`, `players.service.ts` — vue publique restreinte | `economy.test.ts` |
| ROLE-003 compte arbitre | `account_type` choisi à l'inscription, exclusif du rôle joueur | `competition.test.ts` |
| ROLE-003 exclusivité tenue côté serveur | `joinProposal` et `registerSubstitute` refusent un arbitre | `eligibility.test.ts` |
| ROLE-003 devenir arbitre libère les places | `setAccountType` déclenche le même retrait | `eligibility.test.ts` |
| ROLE-003 l'arbitre n'a pas de division | `division` vaut `null` dans les vues publiques ; `setDivision` refuse | `eligibility.test.ts` |
| ROLE-003 l'arbitre hors du classement | `isRankedPlayer` sur toutes les requêtes de `ranking.service.ts` | `eligibility.test.ts` |
| ROLE-003 l'arbitre hors des mouvements de saison | ni promu ni relégué par `applyPromotionsAndRelegations` | `eligibility.test.ts` |
| SUP-001 droit de supervision | `players.is_supervisor`, accordé et retiré par l'administration seule | `supervision.test.ts` |
| SUP-001 autorisation serveur | `supervisorProcedure` + `maySupervise`, droit relu en base à chaque requête | `supervision.test.ts` |
| SUP-001 conflit d'intérêt | session absente de la file **et** saisie refusée, pour un joueur ou un arbitre de la session | `supervision.test.ts` |
| SUP-001 saisie identique à celle de l'admin | routeur `supervision` unique, appelé par les deux | `supervision.test.ts` |
| SUP-001 saisie en visionnage ouverte aux superviseurs | `tracker.router.ts` passe en `supervisorProcedure` ; route `/visionnage` | vérifié en navigateur |
| SUP-001 publication d'une feuille où l'on figure | refusée pour un superviseur, dans `publishSession` | `tracker.test.ts` |
| MATCH-007 correction d'une session clôturée | `reopenSession` défait la clôture, la saisie ordinaire la rejoue | `correction.test.ts` |
| MATCH-007 réversibilité exacte | statistiques, XP, niveau, homme du match, sessions jouées, division et note rendus à l'identique | `correction.test.ts` |
| MATCH-007 ce qui ne se défait pas | UNO versés et places retirées ailleurs — annoncé avant de confirmer | `correction.test.ts` |
| MATCH-007 même garde-fou que la saisie | refusée au superviseur qui a joué la session | `correction.test.ts` |
| CARD-002 note évolutive | `players.rating` stockée, déplacée à la clôture selon la session précédente | `rating.test.ts`, `domain.test.ts` |
| CARD-002 hausse **et** baisse | `ratingMovement` suit le signe de l'écart, sans seuil | `domain.test.ts` |
| CARD-002 amplitude bornée | crans de `RATING_MOVE_SPAN`, plafond `RATING_MOVE_MAX`, note entre 50 et 99 | `domain.test.ts` |
| CARD-002 trace du mouvement | `proposal_participants.rating_before/after`, flèche dans l'historique | `rating.test.ts` |
| CARD-003 échelle par division | `RATING_BANDS` — D3 50→72, D2 62→84, D1 74→99 | `domain.test.ts` |
| CARD-003 bandes qui se chevauchent | un D3 en forme dépasse un D2 en difficulté, volontairement | `domain.test.ts` |
| CARD-003 la montée replace la note | `rebandRating` à chaque changement de division, hors clôture | `domain.test.ts` |
| XP-002 palier de plus en plus coûteux | `xpForLevel` — 300 + 100 × (niveau − 1) | `domain.test.ts` |
| XP-002 rythme fidèle à la ligue | niveau 10 en une saison, niveau 20 en trois ans et demi | `domain.test.ts` |
| XP-002 l'XP vient aussi des distinctions | `XP_AWARDS.topScorer/topAssist/topDefender/bestTeam` | `rating.test.ts` |
| XP-003 UNO par palier franchi | `levelUpReward` — 10 × (niveau − 1), un seul chemin (`awardXp`) | `rating.test.ts` |
| XP-003 palier payé une seule fois | clé `reward:level:<joueur>:<niveau>` | `rating.test.ts` |
| AUTH-009 identité non modifiable par le joueur | ni e-mail ni date de naissance dans `updateProfileSchema` | `auth.test.ts` |
| AUTH-010 majorité à l'inscription | `adultDateOfBirthSchema`, âge calculé sur le jour civil | `auth.test.ts` |
| ADMIN-008 correction par l'administration | `admin.updatePlayer`, majorité toujours exigée, unicité de l'e-mail | `auth.test.ts` |
| SUP-003 le superviseur ne touche pas aux sessions | routes de session en `adminProcedure` ; `/visionnage` seul conservé | `supervision.test.ts` |
| SUP-003 conflit d'intérêt là où il mord | contrôle à la publication d'une feuille, pas sur des routes admin | `tracker.test.ts` |
| TRACK-001 plusieurs enregistrements par feuille | `stat_session_videos` ; fichier local ou adresse | vérifié en navigateur |
| TRACK-001 position non ambiguë | `stat_matches.video_id` accompagne `video_start_ms` | vérifié en navigateur |
| TRACK-001 la vidéo de saisie suit la session | `publishSession` recopie les enregistrements adressables dans `session_videos`, dédoublonnés | `tracker.test.ts` |
| TRACK-001 lecteurs tiers refusés à la saisie | `isDirectVideoUrl` — YouTube et Vimeo ne se pilotent pas au millième | `tracker.test.ts` |
| P-002 sortie de la saisie en visionnage | « Quitter la saisie » sur la liste et sur la feuille | vérifié en navigateur |
| ROLE-003 un seul arbitre par session | `referees.service.ts` — verrou de proposition **et** condition `IS NULL` | `competition.test.ts` |
| ROLE-003 l'arbitre ne paie pas et est rémunéré | `payReferee`, `reward:session:<id>:referee` | `competition.test.ts` |

## Architecture (§4)

| Exigence | Implémentation |
|---|---|
| TECH-001 configuration par environnement | `apps/api/src/env.ts` — validation stricte, refus de démarrage si incomplet |
| TECH-002 UTC et fuseaux | `packages/shared/src/time.ts` ; pool MySQL en `timezone: "Z"` |
| TECH-003 transactions atomiques | `db.transaction` sur tout mouvement solde + effet métier |

## Données (§5)

| Exigence | Implémentation | Test |
|---|---|---|
| DATA-001 email unique | index unique `users_email_unique` | `auth.test.ts` E2E-002 |
| DATA-002 entiers non négatifs | `CHECK` constraints sur `players`, `transactions`, `matches` | `economy.test.ts` |

## Authentification (§6)

| Exigence | Implémentation | Test |
|---|---|---|
| AUTH-001 inscription | `auth.service.ts` — D3, niveau 1, 1000 UNO via le registre | E2E-001 |
| AUTH-002 politique de mot de passe | `packages/shared/src/password.ts` + scrypt | `auth.test.ts` |
| AUTH-003 email normalisé | `emailSchema` (trim + minuscules) | `auth.test.ts` |
| AUTH-004 connexion | réponse générique, hash factice si email inconnu | E2E-003 |
| AUTH-005 déconnexion | session supprimée en base, cookie effacé | `auth.router.ts` |
| AUTH-006 session restaurée | `auth.me` au démarrage | `auth.test.ts` |
| AUTH-007 modification profil | `updateProfileSchema` exclut division, solde et stats | `auth.test.ts` |
| AUTH-008 changement mot de passe | ancien mot de passe requis, toutes sessions révoquées | `auth.test.ts` |

## Dashboard (§7)

| Exigence | Implémentation | Test |
|---|---|---|
| HOME-001 trois prochaines sessions | `listUpcomingForPlayer` | `calendar.test.ts` |
| HOME-002 équivalent EUR | `formatEur` — 1000 UNO → 100,00 € | `domain.test.ts` |

## Calendrier (§8)

| Exigence | Implémentation | Test |
|---|---|---|
| CAL-001 vue mensuelle lundi→dimanche | `screens/calendar.tsx` — `monthMatrix` | vérifié en navigateur |
| CAL-002 filtres et cloisonnement par division | `listProposals` impose la division du joueur | `calendar.test.ts` |
| CAL-002 la division réelle prime | `eligibility.service.ts` — place retirée dès que la division change | `eligibility.test.ts` ELIG-001, ELIG-004 |
| CAL-002 remboursement de la place retirée | crédit en UNO sous clé d'idempotence, même après paiement en euros | `eligibility.test.ts` ELIG-002 |
| CAL-002 reprise par un remplaçant | poste conservé dans l'équipe ; sinon tirage effacé et session rouverte | `eligibility.test.ts` ELIG-003 |
| CAL-002 session jouée intouchable | filtre de date et exclusion de la session en cours de clôture | `eligibility.test.ts` ELIG-005 |
| CAL-002 balayage d'entretien | `sweepIneligibleSeats`, une transaction par place | `eligibility.test.ts` |
| CAL-003 création à J+2 | `resolveNewProposal` | E2E-004, E2E-005 |
| CAL-004 créneaux 14 h → minuit | `packages/shared/src/slots.ts` | `domain.test.ts` |
| CAL-005 déduplication | index unique sur `active_slot_key` ; redirige vers l'inscription | `calendar.test.ts` |
| CAL-006 rejoindre, idempotent | index unique `(proposition, joueur)` | `calendar.test.ts` |
| CAL-007 quota → réservation | `joinProposal` sous verrou | `calendar.test.ts` |
| CAL-008 quitter | autorisé au seul statut proposition | `calendar.test.ts` |
| CAL-009 paiement UNO | prix lu en base, jamais reçu du client | `calendar.test.ts` |
| CAL-010 paiement externe | adaptateur PSP + webhook signé | `payments/stripe.adapter.ts` |
| CAL-010 carte, Apple Pay, Google Pay | tunnel Stripe `card` ; porte-cartes proposés par l'appareil | `calendar.test.ts` |
| CAL-010 Bancontact | `stripe_bancontact` — méthode distincte, EUR uniquement | `calendar.test.ts` |
| CAL-010 retour de paiement | `components/payment-return.tsx` — attend le webhook, ne conclut rien | vérifié en navigateur |
| CAL-011 passage en session | `markParticipantPaid` | E2E-007 |
| CAL-012 détail et CTA | `screens/proposal-detail.tsx` | vérifié en navigateur |

## Matchs (§9)

| Exigence | Implémentation | Test |
|---|---|---|
| MATCH-001 équipes équilibrées | tirage par chapeaux, graine = identifiant de session | `domain.test.ts`, `competition.test.ts` |
| MATCH-002 format 5v5, 2 × 20 min | `MATCH_FORMAT` | écran Informations |
| MATCH-001 UNO League : 3 équipes de 5 | `generateTeams`, seul le match d'ouverture est créé | `competition.test.ts` |
| MATCH-001 le vainqueur reste, l'entrante reste sur nul | `nextPairing` (`packages/shared/src/teams.ts`) | `domain.test.ts` |
| MATCH-001 ajout manuel des matchs | `admin.addMatch` / `removeMatch`, modes classés uniquement | `competition.test.ts` |
| MATCH-001 changement d'équipe d'un joueur | `assignPlayerToTeam`, refusé dès la première validation | `competition.test.ts` |
| MATCH-003 score entier positif | schéma + `CHECK` en base | `competition.test.ts` |
| MATCH-004 statistiques cumulées | `validateMatch` | `competition.test.ts` |
| MATCH-005 validation unique | `validated_at` + clés d'idempotence sur les récompenses | `competition.test.ts` |
| MATCH-006 historique | `listHistoryForPlayer` | `competition.test.ts` |
| MATCH-006 détail d'une session passée | `sessionScoreboard`, `sessionPodium`, `components/fut-card/session-results.tsx` | vérifié en navigateur |
| §8.2 podium de session | `sessionPodium` — distinctions calculées sur les matchs validés | `competition.test.ts` |

## Classement (§10)

| Exigence | Implémentation | Test |
|---|---|---|
| RANK-001 par division | `ranking.service.ts` | `competition.test.ts` |
| RANK-002 filtres statistiques | cinq statistiques + classement général | `screens/ranking.tsx` |
| RANK-002 tableau de classement | colonnes MJ / B / P / D / A / M / Pts, drapeau et poste | vérifié en navigateur |
| RANK-003 départage déterministe | `rankingScore` v2 (1,5 / 1 / 0,5 / 0,5), ordre total | `domain.test.ts` |
| RANK-004 recalcul après validation | statistiques reportées à la validation | `competition.test.ts` |
| RANK-005 montées/descentes configurables | quotas en paramètre | `competition.test.ts` |
| RANK-005 montées/descentes par session | `computeOutcomes`, 5 montent / 5 descendent, extrémités figées | `competition.test.ts` |
| §8.2 homme du match | calculé : meilleur total de points de la session | `competition.test.ts` |
| §8.2 meilleur défenseur | `defensiveScore` = défenses + arrêts | `competition.test.ts` |
| §8 amical sans récompense | aucune prime annoncée ni versée, aucune division touchée | `competition.test.ts`, `calendar.test.ts` |
| CAL-008 délai de paiement 24 h | `payment_deadline`, rappel et signalement | `proposals.service.ts` |
| CAL-008 remplaçants | `registerSubstitute`, `takeOverSeat` sous verrou | `proposals.service.ts` |

## Wallet (§11)

| Exigence | Implémentation | Test |
|---|---|---|
| WAL-001 solde jamais négatif | `debit` + `CHECK` en base | `economy.test.ts` |
| WAL-002 transfert entre joueurs réels | recherche en base, auto-transfert interdit | E2E-010 |
| WAL-003 atomicité | débit, crédit et écritures dans une transaction | `economy.test.ts` |
| WAL-004 détail de chaque ligne | `resolveTransactionLinks` — session, commande ou joueur, en trois requêtes | `economy.test.ts` |
| WAL-004 historique décroissant | tri par identifiant décroissant | `economy.test.ts` |
| WAL-005 types de transaction | liste versionnée | `constants.ts` |
| WAL-006 balanceAfter | figé à l'écriture ; contrôle de cohérence exposé à l'admin | `economy.test.ts` |

## Boutique (§12)

| Exigence | Implémentation | Test |
|---|---|---|
| SHOP-001 catalogue filtré | produits disponibles et non archivés | `economy.test.ts` |
| SHOP-002 détail et solde après achat | `screens/product-detail.tsx` | vérifié en navigateur |
| SHOP-002 carrousel d'images | `components/ui/image-carousel.tsx` (défilement natif, flèches, pastilles, clavier) | vérifié en navigateur |
| SHOP-003 commande atomique | commande + lignes + débit + transaction | E2E-011 |
| SHOP-004 historique | `screens/orders.tsx` | `economy.test.ts` |
| SHOP-005 solde insuffisant | transaction annulée, base inchangée | `economy.test.ts` |
| SHOP-006 images multiples | URLs validées côté serveur, 6 au maximum | `storage/index.ts` |
| SHOP-001 recherche produit | `listShopItems` (jokers SQL échappés) | `economy.test.ts` |
| SHOP-002 notes et avis | `reviews.service.ts`, un avis par joueur et par produit | `economy.test.ts` |
| SHOP-002 tailles et pointures | `size_kind` + `sizes`, taille revalidée à l'achat | `economy.test.ts` |
| SHOP-005 annulation par le joueur | `cancelOwnOrder`, remboursement et stock rendu | `economy.test.ts` |
| SHOP-006 galerie administrable | `components/admin/product-images-field.tsx` (téléversement multiple, ordre, retrait) | vérifié en navigateur |

## Modes et informations (§13)

| Exigence | Implémentation |
|---|---|
| MODE-001 cinq modes, trois inactifs | `screens/modes.tsx` — « Bientôt disponible », aucun parcours fantôme |
| INFO-001 chiffres cohérents | toutes les valeurs viennent de `@uno/shared` |

## Annonces (§14)

| Exigence | Implémentation |
|---|---|
| ANN-001 liste avec état lu/non lu | `announcements.service.ts` |
| ANN-002 détail marque comme lu | `announcements.get` |
| ANN-003 push | Web Push (VAPID) : `push.service.ts`, `public/sw.js`, `components/push-settings.tsx` |
| ANN-004 anti-duplication | index unique `(joueur, évènement, canal)`, vérifié **avant** l'envoi push |
| ANN-004 push pour joueurs, arbitres et admin | `pushToPlayer`, `pushToAdmins` ; un échec n'annule jamais l'opération |

## Administration (§15)

| Exigence | Implémentation | Test |
|---|---|---|
| ADMIN-001 accès par rôle serveur | `adminProcedure` | E2E-012 |
| ADMIN-002 ajustement UNO | débit refusé si solde insuffisant | `competition.test.ts` |
| ADMIN-003 changement de division | audité | E2E-013 |
| ADMIN-004 gestion produits | archivage si déjà commandé | `economy.test.ts` |
| ADMIN-004 suivi des commandes | `listAllOrders`, `updateOrderStatus`, `screens/admin/orders.tsx` | vérifié en navigateur |
| ADMIN-006 flux d'évènements | `admin-events.service.ts`, compteurs et acquittement borné | `economy.test.ts` |
| ADMIN-007 gestion des lieux | `venues.service.ts`, désactivation si déjà utilisé | vérifié en navigateur |
| MATCH-003 saisie d'une session | `recordSession`, tout-ou-rien, `components/supervision/session-queue.tsx` | `competition.test.ts` |
| SUP-002 vidéos de session | liens uniquement, jusqu'à 6 par session | `supervision.test.ts` |
| SUP-002 cadre intégré contrôlé | seuls YouTube et Vimeo ; adresse reconstruite par le serveur à partir du seul identifiant | `supervision.test.ts` |
| SUP-002 fichier joué sur place | `<video>` pour toute autre adresse — il décode, il n'exécute pas ; repli sur le lien en cas d'échec | vérifié en navigateur |
| SUP-002 schémas refusés | ni `javascript:`, ni `data:` ; http(s) seulement | `supervision.test.ts` |
| SUP-002 visibilité | participants, arbitre, superviseurs et administration | `supervision.test.ts` |
| ADMIN-005 audit | `audit_logs` avec valeurs avant/après | E2E-013 |

## Sécurité (§17)

| Exigence | Implémentation |
|---|---|
| SEC-001 sessions sécurisées | cookie `httpOnly` ; aucun mot de passe côté client |
| SEC-002 routes privées | 401 sans session, 403 sans le rôle |
| SEC-003 validation serveur | schémas Zod stricts avec longueurs maximales |
| SEC-004 injection SQL | requêtes paramétrées uniquement (testé) |
| SEC-005 photos | type, taille et signature binaire vérifiés ; nom généré par le serveur |
| SEC-006 secrets | uniquement par variables d'environnement |
| SEC-007 journalisation | rédaction des mots de passe, jetons et données PSP ; aucun détail technique renvoyé au client |
| SEC-008 suppression de compte | statuts `deleted` / `anonymized` ; le registre financier reste intact |

## États et règles transverses (§19)

| Exigence | Implémentation | Test |
|---|---|---|
| STATE-001 transitions atomiques | verrou puis relecture de l'état réel | `calendar.test.ts` |
| STATE-002 idempotence | clés uniques en base sur paiements, commandes et transferts | `calendar.test.ts`, `economy.test.ts` |
| STATE-003 hors ligne | bandeau explicite ; écritures financières désactivées | `screens/*` |

## Cas limites obligatoires (§21.1)

| Cas | Test |
|---|---|
| Dernière place prise simultanément | `calendar.test.ts` STATE-001 |
| Paiement envoyé deux fois | `calendar.test.ts` STATE-002 |
| Solde exactement égal au prix | `economy.test.ts` |
| Solde inférieur d'un UNO | `economy.test.ts` E2E-008 |
| Double inscription | `calendar.test.ts` CAL-006 |
| Retrait après réservation | `calendar.test.ts` CAL-008 |
| Proposition expirée | `expireStaleProposals` |
| Produit désactivé après affichage | `economy.test.ts` |
| Produit supprimé avec commande existante | `economy.test.ts` ADMIN-004 |
| Deux achats concurrents | `economy.test.ts` E2E-009 |
| Webhook reçu deux fois | `applyWebhookOutcome` |

## Saisie en visionnage (TRACK-001)

| Exigence | Implémentation | Test |
|---|---|---|
| Relever une action en deux gestes, en regardant l'enregistrement | `screens/tracker/capture-pad.tsx`, raccourcis clavier dans `capture.tsx` | — |
| Score déduit des buteurs, jamais saisi | `aggregateMatch` (`packages/shared/src/tracker.ts`) | `tracker.test.ts` (domaine) |
| Buts encaissés attribués au gardien en poste | `aggregateMatch`, `goalkeeperAt` | `tracker.test.ts` (domaine) |
| Horloge de match déduite de la position vidéo | `matchClockFromVideo` | `tracker.test.ts` (domaine) |
| Saisie insensible au réseau, file rejouable | `use-capture.ts`, index unique `stat_events.client_id` | `tracker.test.ts` (API) |
| Composition modifiable en cours de séance | `moveParticipant`, `teamId` figé sur l'action | `tracker.test.ts` (API) |
| Écart entre score relevé et buts saisis bloquant | `checkMatch`, `publicationBlockers` | `tracker.test.ts` (API et domaine) |
| Publication vers le classement officiel | `publishSession` → `applyRecordSession` | `tracker.test.ts` (API) |
| Récompenses UNO commandées séparément | option `awardUno` (`RecordOptions`) | `tracker.test.ts` (API) |
| Feuille publiée non modifiable | `assertEditable` | `tracker.test.ts` (API) |
| Plusieurs enregistrements, fichier local ou adresse | `stat_session_videos`, adresse facultative ; `video-deck.tsx` | `tracker.test.ts` (API) |
| Enregistrements recopiés sur la session publiée | `publishSession` → `session_videos`, dédoublonné par adresse | `tracker.test.ts` (API) |
| YouTube et Vimeo refusés à l'ajout | `isDirectVideoUrl` : une page de lecteur ne se pilote pas au millième | `tracker.test.ts` (API) |
