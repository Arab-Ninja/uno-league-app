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
| CAL-008 délai de paiement 24 h | `payment_deadline` posé au quota, tous modes confondus | `calendar.test.ts` |
| CAL-008 remplaçants | `registerSubstitute` puis `admitSubstitute` sous verrou : le remplaçant s'ajoute | `calendar.test.ts` |
| CAL-008 places impayées retirées | `dropUnpaidParticipants`, au paiement qui complète le quota | `calendar.test.ts` |
| CAL-002 sessions terminées | visibles des seuls participants, arbitre et supervision | `calendar.test.ts` |

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

## Mode SQUAD — réservation du nom (SQUAD-002)

| Exigence | Implémentation | Test |
|---|---|---|
| Deux clubs actifs ne portent pas le même nom | index uniques `squads_active_name_unique` / `squads_active_slug_unique` | `squads.test.ts` — « la base refuse deux clubs actifs du même nom » |
| Un club dissous libère son nom sans perdre son histoire | `leaveSquad` vide `active_name` / `active_slug`, `name` reste | `squads.test.ts` — « dissoudre libère le nom, sans effacer l'histoire » |
| La réservation suit la fondation, le renommage et la dissolution | `createSquad`, `updateSquad`, `leaveSquad` (`squads.service.ts`) | `squads.test.ts` — « fonder, renommer, dissoudre : la réservation suit » |
| Aucune migration n'ajoute de colonne générée par `ALTER TABLE` (TiDB, erreur 3106) | migrations `0011` et `0013` en colonnes ordinaires | `migration.test.ts` — « n'ajoute jamais de colonne générée stockée par ALTER TABLE » |

## Mode SQUAD — places et règlement (SQUAD-006)

| Exigence | Implémentation | Test |
|---|---|---|
| 10 € / 1 h et 20 € / 2 h par joueur, hors mise | `SQUAD_SEAT_PRICE_EUR`, `squadSeatPriceUno` | `squad-seats.test.ts` — « le prix dépend de la durée » |
| Le prix est figé à l'inscription | `price_uno` sur `squad_challenge_seats` | `squad-seats.test.ts` — « se fige à l'inscription » |
| Chaque joueur paie sa place | `paySeat` → `debit` type `session_fee` | `squad-seats.test.ts` — AC06 |
| La caisse peut prendre des places en charge, sur décision du fondateur | `coverSeats`, `assertSquadRole(..., "founder")` | `squad-seats.test.ts` — AC06 et « pouvoir de fondateur » |
| Cinq joueurs par équipe | `SQUAD_ROSTER_SIZE`, contrôle sous verrou du défi | `squad-seats.test.ts` — « et pas un de plus » |
| Un joueur retiré est remboursé là d'où venait l'argent | `releaseSeat` | `squad-seats.test.ts` — « rend l'argent là d'où il venait » |
| Une place rendue ne bloque pas une réinscription | colonnes générées `live_challenge_id` / `live_player_id` | `squad-seats.test.ts` — « retiré puis réinscrit » |
| Le vainqueur prend les deux mises ; un nul rend à chacun la sienne | `applySettlement` | `squad-seats.test.ts` — AC07 (deux cas) |
| Les places ne sont pas rendues au vainqueur | `applySettlement` ne touche pas aux places | `squad-seats.test.ts` — « la salle a été jouée » |
| Annuler un défi accepté rend mises et places | `annulChallenge` → `releaseAllSeats` | `squad-seats.test.ts` — « annuler un défi accepté » |
| Régler ou annuler est réservé à l'administration | `squadAdminProcedure` | `squad-seats.test.ts` — « réservé à l'administration » |
| Le fil d'un défi accepté reste ouvert | `isChallengeChatOpen` | `squad-seats.test.ts` — SQUAD-005 (deux cas) |

## Test depuis un téléphone du réseau local (DEV-001)

| Exigence | Implémentation | Test |
|---|---|---|
| L'adresse du routeur n'est pas connue d'avance | `isPrivateNetworkOrigin` (`lib/network.ts`) | `network.test.ts` — six cas, dont quatre refus |
| La tolérance ne vaut que hors production | garde `!isProduction` dans `index.ts` | — (une seule condition, lue sur place) |
| Un nom public qui imite une adresse privée est refusé | l'hôte entier est comparé, pas son préfixe | `network.test.ts` — « imite une adresse privée » |
| Une origine refusée répond 403, pas 500 | `ForbiddenOriginError` + gestionnaire final | vérifié en direct (403 contre 200) |
| Le serveur de développement écoute sur le réseau | `pnpm dev:mobile` → `vite --host` | — |
| La page est servie en HTTPS (caméra) | `@vitejs/plugin-basic-ssl` sous `VITE_DEV_HTTPS` | vérifié : `isSecureContext` vrai |
| Le port annoncé est le port réel | `strictPort` en mode téléphone | — |
| Les photos envoyées sont joignables du téléphone | `STORAGE_PUBLIC_URL` réécrite vers le serveur de développement | vérifié : image chargée depuis le téléphone simulé |
| Le moteur de vision suit aussi en mode réseau | `predev:lan` | vérifié : les trois fichiers servis en 200 |
| Un contexte non sécurisé est expliqué, pas déguisé | message distinct dans `PortraitCapture` | — |
| L'adresse à ouvrir est affichée | `scripts/lan.mjs`, `pnpm lan` | — |

## Mode SQUAD — match et résultat (SQUAD-005, MODE-002)

| Exigence | Implémentation | Test |
|---|---|---|
| Le résultat se saisit comme celui d'un amical ou d'une League | le match est une `proposals` en mode `squad` | `squad-matches.test.ts` — « le match naît du défi » |
| Statistiques et XP oui, division et note non | `GameMode.effects` (MODE-002) | `squad-matches.test.ts` — MODE-002 et AC08 |
| Aucune récompense UNO individuelle : la mise est le prix | `effects.unoRewards = false` | `squad-matches.test.ts` — « la mise est le prix » |
| Dix places tenues et réglées avant le match | contrôles sous verrou dans `createSquadMatch` | `squad-matches.test.ts` — deux cas de refus |
| L'effectif se fige au coup d'envoi | `assertOpenForComposition` refuse dès `matchId` posé | `squad-matches.test.ts` — « fige l'effectif » |
| Le palmarès et la mise suivent le score | `settleSquadSession` dans la transaction de clôture | `squad-matches.test.ts` — AC08, nul, série |
| Un match réglé ne se rouvre pas | `isSettledSquadSession` + refus explicite | `squad-matches.test.ts` — « ne se rouvre pas » |
| Le nom du mode se lit sur le mode | `gameModeName` (§45) | vérifié à l'écran : « Match SQUAD » |

## Mode SQUAD — marché des transferts (SQUAD-008)

| Exigence | Implémentation | Test |
|---|---|---|
| Un club affiche un membre cessible | `squad_members.listed_at`, `setListed` | `squad-transfers.test.ts` — « un club affiche un membre cessible » |
| Triple accord : vendeur, acheteur, joueur | `respondSelling` puis `respondPlayer` | `squad-transfers.test.ts` — AC09 et « le joueur seul tranche » |
| Indemnité au club, prime au joueur | deux colonnes, `transferTotalCost` | `squad-transfers.test.ts` — AC09 |
| Séquestre à l'acceptation du vendeur, pas avant | `transfer_lock` dans `respondSelling` | `squad-transfers.test.ts` — AC09 |
| Un seul séquestre à la fois par joueur | colonne générée `locked_player_id` + index unique | `squad-transfers.test.ts` — « un seul séquestre à la fois » |
| L'indemnité ne peut que monter, marchandage borné | `minimumCounterFee`, `mayCounterTransfer` | `squad-transfers.test.ts` — « ne peut que monter » |
| Carence de 7 jours après un transfert | `isInTransferCooldown` | `squad-transfers.test.ts` — « observe une carence » |
| Un fondateur ne se transfère pas | `assertTransferable` | `squad-transfers.test.ts` — « un fondateur ne se transfère pas » |
| Un joueur engagé sur un défi n'est pas transférable | `assertNotEngaged` | `squad-transfers.test.ts` — « inscrit sur un défi à venir » |
| Engager la caisse est un pouvoir de fondateur | `assertSquadRole(..., "founder")` | `squad-transfers.test.ts` — « pouvoir de fondateur » |
| Une offre expirée rend ce qu'elle a engagé | `expireStaleTransfers` → `releaseEscrow` | `squad-transfers.test.ts` — « une offre expirée » |
| Retrait impossible une fois chez le joueur | `assertNegotiable` dans `cancelTransfer` | `squad-transfers.test.ts` — « l'acheteur retire son offre » |

## Mode SQUAD — cote et classement (SQUAD-007)

| Exigence | Implémentation | Test |
|---|---|---|
| Cote de type Elo, départ 1000, K 32 | `nextSquadRatings` (`squad-rating.ts`) | `squad-rating.test.ts` — « entre égaux » |
| **Indépendante des mises** | la cote ne lit que le résultat | `squad-rating.test.ts` — AC10 « ne dépend pas de la mise » |
| Les deux cotes calculées sur celles d'avant | une seule lecture avant écriture | `squad-rating.test.ts` — « la somme est conservée » |
| Battre plus fort rapporte davantage | formule d'Elo, constante 400 | `squad-rating.test.ts` — « battre plus fort » |
| Une cote ne descend pas sous zéro | `Math.max(0, …)` + contrainte CHECK | `squad-rating.test.ts` — « sous zéro » |
| Le mouvement reste lisible | 4 colonnes sur `squad_challenges` | `squad-rating.test.ts` — AC10 « l'historique la garde » |
| Classement des clubs par cote | `listSquads` (tri serveur), `SquadLeaderboard` | `squad-rating.test.ts` — AC10 « le mieux coté en tête » |
| Jeu d'essai complet et cohérent | `seed-squads.ts` | vérifié à l'écran : 4 clubs, 2 défis, 1 transfert, 2 au marché |

## Retouches de classement, d'information et de droits

| Exigence | Implémentation | Test |
|---|---|---|
| Qui n'a joué aucune séance n'est pas classé | `isRankedPlayer` (`ranking.service.ts`) | `competition.test.ts` — RANK-006 (deux cas) |
| La fin de saison ne relègue pas un compte inactif | même condition, requêtes de montée/descente | `competition.test.ts` — RANK-006 |
| Nationalités par ordre alphabétique | `COUNTRIES` (`lib/countries.ts`) | vérifié à l'écran |
| Le barème appartient au mode UNO League | `info.tsx`, dans la carte du mode | vérifié à l'écran |
| Le mode SQUAD décrit dans Informations | carte dédiée, hors « bientôt disponibles » | vérifié à l'écran |
| KPI « Arbitres » au tableau de bord | `roleCounts` + section « Comptes » | vérifié à l'écran |
| Un superviseur ne rouvre pas une session | route `adminProcedure`, bouton en `isAdmin` | `correction.test.ts` — « réservée à l'administration » |

## Cartes FUT et images dans le mode SQUAD

| Exigence | Implémentation | Test |
|---|---|---|
| Cliquer un joueur ouvre sa carte FUT | `PlayerChip` + `PlayerCardDialog` | vérifié à l'écran (4 écrans) |
| Vignette de carte avant le nom | taille `xs` de `FutCard` | vérifié à l'écran |
| Écusson d'un SQUAD | `squads.avatar_url`, `ImagesField` | vérifié à l'écran |
| Photo de couverture d'un SQUAD | `squads.cover_url` (migration 0017) | vérifié à l'écran |
| Les images d'un club sont posées par son fondateur | `squads.update` → `assertSquadRole(founder)` | `squads.test.ts` (rôles) |

## Statistiques détaillées du joueur (STAT-001)

| Exigence | Implémentation | Test |
|---|---|---|
| Voir toutes les statistiques | écran `/profil/statistiques` | vérifié à l'écran |
| Ratios par séance | `perSession` (`statistics.service.ts`) | `statistics.test.ts` — « sur la carrière » |
| Le ratio ne dépend pas de la fenêtre affichée | dénominateur = `matchesPlayed` | `statistics.test.ts` — fenêtre 30 contre 1 |
| Graphiques d'évolution | `SessionLineChart` | vérifié au rendu |
| La courbe ignore les modes sans effet de carrière | filtre sur `effects.careerStats` | `statistics.test.ts` — « séances qui ne comptent pas » |
| Aucune division par zéro | `perSession()` rend 0 sans séance | `statistics.test.ts` — « tout est à zéro » |
| Une échelle par cadre, couleurs validées | `SERIES_COLORS`, cadres séparés | validateur de palette (6 contrôles) |

## Boutique : catégories, dons et propositions (SHOP-007 à SHOP-009)

| Exigence | Implémentation | Test |
|---|---|---|
| Un catalogue qui s'étend (multimédia, jeux vidéo, sport, maison…) | `SHOP_CATEGORIES` (14 rayons), colonne `varchar(30)` | vérifié à l'écran |
| Ajouter un rayon sans migration | liste fermée côté code, validée par Zod | `migration.test.ts` |
| La conversion ENUM → VARCHAR tient sur TiDB | migration 0018 : ajout, recopie, suppression, renommage | appliquée et rejouée sur MySQL |
| Aucune migration ne convertit un ENUM | `migration.test.ts` — « ne convertit jamais le type d'une colonne ENUM » | vérifié contre la forme générée par drizzle-kit |
| Catégorie « Don » | `DONATION_CATEGORY`, fiche produit dédiée | `shop-donations.test.ts` |
| Associations administrées (nom, image, site officiel) | table `charities`, `charities.service.ts`, onglet Associations | `shop-donations.test.ts` — droits refusés au joueur |
| Choix de l'association au moment du don | `order_items.charity_id` + nom figé | `shop-donations.test.ts` — « fige son nom » |
| Un don sans association est refusé | `createOrder`, catégorie relue en base | `shop-donations.test.ts` — sans débit ni commande |
| Une association retirée n'accepte plus de don | contrôle `active` sous verrou d'achat | `shop-donations.test.ts` |
| Une association sur un article ordinaire est refusée | même contrôle, en sens inverse | `shop-donations.test.ts` |
| Le joueur ne voit que les associations actives | `listActiveCharities` | `shop-donations.test.ts` |
| Proposer un produit (titre, description, URL) | `shop.suggest`, table `shop_suggestions` | `shop-donations.test.ts` |
| L'administration valide ou écarte | onglet Propositions, `admin.decideSuggestion` | `shop-donations.test.ts` |
| L'auteur est notifié de la décision | `notifyPlayer` dans la transaction de décision | `shop-donations.test.ts` — retenue et écartée |
| Une proposition ne se décide qu'une fois | statut vérifié sous transaction | `shop-donations.test.ts` — CONFLICT |
| Un joueur ne voit que ses propositions | `listOwnSuggestions` filtré sur le joueur | `shop-donations.test.ts` |
| La file d'attente est fermée aux joueurs | `adminProcedure` | `shop-donations.test.ts` — FORBIDDEN |
| Pastille des propositions en attente | `admin.stats.pendingSuggestions` | vérifié à l'écran |

## Correctifs d'essai : saisie SQUAD, historique, supervision, rôles

| Exigence | Implémentation | Test |
|---|---|---|
| Saisir les statistiques d'un match SQUAD | route `/sessions/:id/saisie`, bouton sur la feuille de match | `squad-matches.test.ts` — « avant le coup d'envoi » |
| Le match SQUAD figure dans la saisie en visionnage | `attachableSessions()` (sessions à venir comprises) | `squad-matches.test.ts` — « reprend le mode et les deux clubs » |
| Une feuille rattachée hérite du mode de sa session | `createSession` lit `proposal.modeId` | `squad-matches.test.ts` |
| Les deux clubs sont repris tels quels | `formedTeams` + `copyFormedTeams` | `squad-matches.test.ts` |
| Un joueur ne change pas de camp sur un match SQUAD | `assignPlayerToTeam` refuse le mode `squad` ; sélecteur retiré | `squad-matches.test.ts` — « ne se réorganisent pas » |
| Un joueur ajouté à une feuille apparaît dans son historique | `enrolSheetPlayers` à la publication | `tracker.test.ts` — TRACK-002 |
| Le superviseur ne se voit pas proposer sa séance | `attachable` filtré sur son identifiant | `supervision.test.ts` |
| Il ne crée pas de feuille sur sa séance | `isSessionOfPlayer` à la création | `supervision.test.ts` |
| Une feuille où il figure ne s'ouvre ni ne s'écrit | `assertMayHandleSheet` sur chaque route | `supervision.test.ts` |
| Inscription : le type de compte au-dessus des noms | grille limitée à « Prénom » et « Nom » | vérifié à l'écran |
| « Lancer un défi » réservé au fondateur et aux capitaines | `useSquadRole` + `squadRoleAtLeast` | vérifié à l'écran (membre et capitaine) |
| Répondre à un défi suit la même règle | `mayNegotiate` dans l'écran de défi | vérifié à l'écran |

## Photo de profil : détourage et contrôle (PHOTO-001, PHOTO-002)

| Exigence | Implémentation | Test |
|---|---|---|
| Le fond est retiré automatiquement | `cutOutPortrait` (MediaPipe ImageSegmenter, masque en alpha) | vérifié en navigateur, WebP transparent de 43 Ko |
| Aucune image n'est envoyée à un tiers | modèles embarqués, `public/vision/` | aucune requête sortante à l'analyse |
| Recadrage façon photo d'identité | `framing()` : tête aux deux tiers, regard au tiers supérieur | vérifié au rendu |
| Le fond peut être conservé | case « Garder le fond », re-traitement de l'image d'origine | vérifié en navigateur |
| Prise de vue par la caméra, pas la pellicule | `getUserMedia({ facingMode: "user" })`, repère ovale | vérifié en navigateur (caméra simulée) |
| Repli si la caméra est indisponible | choix d'un fichier, message explicite | vérifié en navigateur |
| Un seul visage, de face, yeux ouverts | `analysePortrait` + `inspectPortrait` | `portrait.test.ts` (9 cas) |
| Photo floue ou trop sombre refusée | variance du laplacien, luminosité moyenne | `portrait.test.ts` ; mesuré 0,175 net contre 0,007 flou |
| Visage coupé par le bord refusé | `faceMargin` négative | `portrait.test.ts` |
| Rien ne refuse une photo sur ce qui est porté | aucune règle sur les accessoires | `portrait.test.ts` — « rien ne refuse sur ce qui est porté » |
| Un échec technique ne bloque personne | modèles absents → photo envoyée telle quelle | `analysePortrait` renvoie `null` |
| La photo suit l'inscription | seconde étape de `/inscription`, « Plus tard » possible | vérifié de bout en bout en navigateur |
| Permissions natives documentées | `DEPLOIEMENT.md` §4 | — |

## Adresse d'affichage des images (IMG-001)

| Exigence | Implémentation | Test |
|---|---|---|
| Une image s'affiche quelle que soit l'origine | `publicImageSrc` + `imageSrc` dans les composants | vérifié : même photo chargée depuis deux origines |
| Les fichiers envoyés n'inscrivent plus d'hôte | `STORAGE_PUBLIC_URL` relatif par défaut | `images.test.ts` |
| Les anciennes lignes restent lisibles | hôte local ramené au chemin | `images.test.ts` — « une ancienne ligne locale » |
| Une image extérieure garde son adresse | hôtes publics laissés intacts | `images.test.ts` — CDN et bucket S3 |
| Un chemin ne remonte pas de répertoire | `imageRefSchema`, `assertValidImageUrl` | — |
| S3 refuse un préfixe relatif | contrôle croisé dans `env.ts` | — |
| Photos de profil, produits, salles, associations, SQUAD | `ProductImage`, `Avatar`, `FutCard`, carrousel, couverture | vérifié : 18/18 boutique, 2/2 SQUAD, sur les deux origines |


## Tournois entre SQUADs (TOUR-001)

| Exigence | Implémentation | Test |
|---|---|---|
| Créer un tournoi avec les paramètres d'un mode | `createTournament`, onglet « Tournois » de la console | `tournaments.test.ts` — « s'ouvre avec ses paramètres » |
| Élimination directe : 16es ou 8es, quarts, demies, finale | `roundsOf`, `TOURNAMENT_ROUND_LABELS` | `packages/shared/src/tournaments.test.ts` |
| Plateau en puissance de deux | contrainte `tournaments_size_allowed`, `isTournamentSize` | `packages/shared/src/tournaments.test.ts` |
| Inscription par SQUAD, réglée en UNO | `registerSquad`, droit séquestré dans la caisse | `tournaments.test.ts` — « séquestre le droit » |
| Seuls fondateur et capitaine engagent le club | `assertSquadRole(..., "captain")` | `tournaments.test.ts` — « n'appartient qu'aux dirigeants » |
| Le plateau ne se dépasse pas | comptage sous le verrou du tournoi | `tournaments.test.ts` — « se remplit, puis se ferme » |
| Têtes de série figées à l'engagement | colonne `rating_at_entry` | `tournaments.test.ts` — « apparie par les deux bouts » |
| Le vainqueur avance dans le tableau | `nextSlot`, `nextSide` | `tournaments.test.ts` — « le vainqueur avance » |
| Un nul se tranche aux tirs au but | vainqueur saisi, contredit le score → refus | `tournaments.test.ts` — « le vainqueur avance » |
| La dotation va à la caisse du club vainqueur | `finishTournament` | `tournaments.test.ts` — « la dotation va au club qui gagne » |
| Une correction ne laisse pas de résultat orphelin | refus si le tour suivant est joué | `tournaments.test.ts` — « dont la suite est jouée » |
| Réengager après un retrait ne passe pas pour un rejeu | clé d'idempotence portant l'inscription | `tournaments.test.ts` — « le retrait rend le droit » |
| L'annulation rend les engagements | `releaseEntryFees` | `tournaments.test.ts` — « rend son droit à chaque club » |
| Visible et jouable depuis l'onglet SQUAD | section « Tournois », `/tournois`, `/tournois/:id` | vérifié de bout en bout en navigateur |

## Clubs et tournois, deuxième passe (CLUB-001, CLUB-002, TOUR-005)

| Exigence | Implémentation | Test |
|---|---|---|
| « Squad » se dit « Club » partout | chaînes et texte JSX ; identifiants inchangés | vérifié en navigateur sur six écrans |
| L'effectif tient en un sommaire | `RosterSummary`, onglet Club | vérifié en navigateur |
| Terrain avec les meilleurs à leur poste | `composeLineup`, `/squad/:id/effectif` | `lineup.test.ts` (7 tests) |
| Un joueur n'occupe qu'un poste | jeu de `taken` dans `composeLineup` | `lineup.test.ts` — « jamais le même joueur » |
| Les arrêts ne volent pas le défenseur | `FILL_ORDER` sert le gardien en dernier | `lineup.test.ts` — « ne volent pas » |
| Effectif complet en classement | `compareForRoster` | `lineup.test.ts` — « suit la note » |
| Le fondateur reverse des UNO | `distribute`, réservé au fondateur | `squads.test.ts` (5 tests CLUB-002) |
| L'historique est visible de tous | `listTreasuryEntries`, ouvert aux membres | `squads.test.ts` — « le registre le dit » |
| La part engagée ne se partage pas | `moveTreasury` refuse un disponible négatif | `squads.test.ts` — « part engagée » |
| La ligue ouvre des formats | `tournament_formats`, onglet Tournois de la console | `tournaments.test.ts` — « ouvre des formats » |
| Les clubs posent les dates | `proposeTournament` | `tournaments.test.ts` — « posent des dates » |
| Réservé au fondateur et aux capitaines | `assertSquadRole(..., "captain")` | `tournaments.test.ts` — « un simple membre » |
| Un club se place sur plusieurs propositions | aucune exclusivité entre tournois | `tournaments.test.ts` — « plusieurs propositions » |
| Le plateau complet se tire tout seul | `drawBracket` appelé par le dernier engagement | `tournaments.test.ts` — « se tire tout seul » |
| Deux heures pour tous les tournois | `TOURNAMENT_DURATION_HOURS` | `tournaments.test.ts` — « 18:00 - 20:00 » |
| Prix et dotation par format | colonnes du format, copiées sur le tournoi | `tournaments.test.ts` — « ne réécrit pas » |
| La caméra démarre au premier essai | branchement du flux dans un effet | reproduit processeur bridé ×20 |

## Calendrier des tournois et affiches (TOUR-006, CLUB-001)

| Exigence | Implémentation | Test |
|---|---|---|
| Proposition à sept jours au plus tôt | `TOURNAMENT_PROPOSAL_LEAD_DAYS`, appliqué aux deux chemins de création | `tournaments.test.ts` — « au moins sept jours à l'avance » |
| Borne inclusive côté écran | attribut `min` de la feuille de proposition | vérifié en navigateur : min = J+7, valeur pré-remplie identique |
| Calendrier mensuel, à l'image de la ligue | `TournamentsScreen`, grille partagée `lib/month.ts` | vérifié en navigateur |
| Filtres envoyés au serveur | `from`, `to`, `formatId` dans `listTournaments` | `tournaments.test.ts` — « filtre par mois et par format » |
| Trois affiches servant de filtre | `FormatFilter`, `tournament_formats.cover_image_url` | vérifié en navigateur : 3 tuiles, 3 affiches, `aria-pressed` |
| Affiche administrable | `TournamentCoverField`, dossier de téléversement `tournaments` | `tournaments.test.ts` — « l'affiche suit le format, et s'enlève » |
| Une affiche s'enlève | `coverImageUrl` omis remet `null` | même test |
| Adresse d'image restreinte à http(s) | `imageRefSchema` construit l'URL et nomme les schémas | même test — `javascript:` refusé |
| Aperçu des tournois dans l'onglet Club | `Tournaments`, deux propositions les plus proches | vérifié en navigateur |
| Accès au calendrier même sans proposition | lien affiché en toutes circonstances | vérifié en navigateur |
| Un tournoi annulé ne se voit plus | `ne(status, "cancelled")` en SQL | `tournaments.test.ts` — « un tournoi annulé disparaît » |
| L'annulation reste consultable et rend les droits | filtre explicite par statut, caisse inchangée | même test |
| « Le Cinq type » | `SquadRosterScreen` | vérifié en navigateur |
| Le gardien déclaré garde les buts | `claimGoal`, servi avant l'ordre statistique | `lineup.test.ts` — « le gardien déclaré garde les buts » |
| Un gardien sans arrêt ne prend pas la place | `saves > 0` exigé dans `claimGoal` | `lineup.test.ts` — « sans le moindre arrêt » |

## Composition d'une session par l'administration (ADMIN-008)

| Exigence | Implémentation | Test |
|---|---|---|
| Ouvrir une session depuis la console | `admin.createProposal`, onglet Sessions | `admin-roster.test.ts` — « ouvre une session pour aujourd'hui » |
| Le préavis ne s'applique pas à l'administration | `skipLeadTime`, route `adminProcedure` uniquement | même test — le joueur ordinaire reste refusé |
| Inscrire un joueur nommément | `addParticipant` → `joinProposal` | `admin-roster.test.ts` — « inscrire d'abord, régler ensuite » |
| Le paiement n'ouvre qu'au plateau complet | `settleProposal` refuse hors réservation | même test |
| Les règles d'inscription tiennent | division, compte arbitre | `admin-roster.test.ts` — « les règles tiennent toujours » |
| La liste n'offre que des joueurs inscriptibles | `eligibleFor` filtre en SQL | même test |
| Compléter puis régler fait basculer | `fillProposal`, `settleProposal` | `admin-roster.test.ts` — « compléter puis régler » |
| Régler prélève réellement la caisse | `payProposal`, méthode UNO | même test — solde vérifié |
| Un solde vide n'arrête pas les autres | échecs collectés, série poursuivie | `admin-roster.test.ts` — « une caisse vide » |
| L'audit nomme l'administrateur | `writeAudit` avec l'acteur réel | `admin-roster.test.ts` — « l'audit nomme l'administrateur » |
| Routes fermées aux non-administrateurs | `adminProcedure` | `admin-roster.test.ts` — « un joueur ordinaire » |
| Retirer un joueur | `removeParticipant` → `leaveProposal` | `admin-roster.test.ts` — « retirer un joueur » |

## Photo d'un joueur ou d'un arbitre, côté administration (ADMIN-009)

| Exigence | Implémentation | Test |
|---|---|---|
| Poser une photo depuis la console | `PlayerPhotoEditor`, onglet Joueurs | `auth.test.ts` — « l'admin pose la photo » |
| Vaut aussi pour un arbitre | aucun filtre de type de compte | même test — les deux comptes vérifiés |
| Téléverser un fichier | `uploadImage(..., "avatars")`, réduit à 1200 px | vérifié en navigateur |
| Coller une adresse | champ URL, validé au serveur | `auth.test.ts` — adresses douteuses refusées |
| Régler le cadrage | `photoOffsetY`, aperçu sur la carte réelle | vérifié en navigateur — relu à 70 après rechargement |
| Retirer la photo | `profilePhotoUrl: null` | `auth.test.ts` — « la photo se retire » |
| Un patch photo n'efface rien d'autre | repli sur la valeur courante | `auth.test.ts` — « ne touche que la photo » |
| Schémas d'adresse nommés | `assertValidImageUrl` | même test — `javascript:` et `..` refusés |
| L'audit consigne la photo | `player.profile.update` | — |

## Retrait du bonus de bienvenue (ADMIN-010)

| Exigence | Implémentation | Test |
|---|---|---|
| Plus rien n'est offert à l'inscription | `SIGNUP_BONUS_UNO = 0`, crédit conditionnel | `auth.test.ts` — « un compte neuf n'est crédité de rien » |
| Le compte neuf part à zéro | même chemin, sans écriture au registre | même test — solde **et** historique vides |
| L'écran d'inscription ne promet plus rien | `signup.tsx` | vérifié en navigateur |
| Le chemin reste ouvert pour l'avenir | `if (SIGNUP_BONUS_UNO > 0)` | — |
| Reprendre les soldes existants en un geste | `admin.zeroAllBalances`, onglet Joueurs | `economy.test.ts` — « tous les soldes tombent à zéro » |
| La reprise passe par le registre | `debit`, jamais la colonne | même test — `auditPlayerBalance` cohérent |
| Le joueur lit où sont passés ses points | motif exigé, repris dans la description | `economy.test.ts` — « le joueur lit dans son portefeuille » |
| L'administrateur n'est pas exempté | aucun filtre sur l'acteur | même test — trois comptes sur trois |
| Rejouée, elle n'écrit rien | seuls les soldes `> 0` sont débités | `economy.test.ts` — « rejouée, elle ne réécrit rien » |
| Réservée à l'administration | `adminProcedure` | `economy.test.ts` — « un joueur ordinaire ne peut pas vider la ligue » |

## Suppression d'une session, dissolution d'un club (ADMIN-011)

| Exigence | Implémentation | Test |
|---|---|---|
| Supprimer une session pour de bon | `deleteProposal`, onglet Sessions | `admin-purge.test.ts` — « la session disparaît » |
| Chaque place réglée est remboursée | `refundSeat`, réemployé tel quel | même test — soldes revenus au point de départ |
| Le registre reste cohérent | crédit au registre, jamais la colonne | même test — `auditPlayerBalance` |
| Les tables filles suivent | cascades du schéma | `admin-purge.test.ts` — « inscriptions, paiements et équipes » |
| Une feuille de visionnage survit | `stat_sessions.proposal_id` en `set null` | — |
| Le créneau se libère | ligne supprimée, `active_slot_key` avec | `admin-purge.test.ts` — « le créneau se libère » |
| Une session clôturée est d'abord défaite | `applySessionReopen` avant suppression | `deleteProposal`, champ `reopened` |
| Un match de club est refusé | `challengeOfSession` ≠ null | `purge.service.ts`, message nommant le défi |
| Les annulées sont listées | `listDeletableProposals`, tous statuts | `admin-purge.test.ts` — « montre aussi les annulées » |
| Un motif est exigé | `z.string().trim().min(3)` | `admin-purge.test.ts` — « un motif vide est refusé » |
| Un club quitte toutes les listes | statut `dissolved` | `admin-purge.test.ts` — « sort des listes » |
| Le nom redevient disponible | `activeName`/`activeSlug` à `NULL` | même test — un autre club le reprend |
| Les membres sont libérés | `closeMembership` sur chaque adhésion active | `admin-purge.test.ts` — « les membres sont libérés » |
| La caisse revient au fondateur | `moveTreasury` + `credit`, type `squad_dissolution` | `admin-purge.test.ts` — « la caisse revient au fondateur » |
| Les défis en cours sont annulés | `applyChallengeAnnul`, extrait de `annulChallenge` | `admin-purge.test.ts` — « un défi accepté rend ses mises » |
| L'adversaire récupère sa mise | annulation des deux côtés | même test — caisse d'en face à zéro séquestre |
| Les transferts en cours sont clos | `releaseEscrow` puis `cancelled` | — |
| Un tournoi déjà tiré bloque | refus nommant le tournoi | `purge.service.ts` |
| Aucun UNO ne se perd ni ne se crée | somme joueurs + caisses, avant et après | `admin-purge.test.ts` — « aucun UNO ne se perd » |
| Dissoudre deux fois est refusé | statut vérifié sous verrou | `admin-purge.test.ts` — « dissoudre deux fois » |
| Réservées à l'administration | `adminProcedure` | `admin-purge.test.ts` — deux tests « joueur ordinaire » |
| Confirmation en deux temps à l'écran | `ConfirmButton` | **non vérifié en navigateur** — typage et build seulement |

## Garde-fous de configuration (PAY-004)

| Exigence | Implémentation | Test |
|---|---|---|
| Stripe sans secret de webhook ne démarre pas | `superRefine` sur `envSchema` | `env.test.ts` — « Stripe sans secret de webhook est refusé » |
| Le message nomme le risque, pas la variable | texte « les cartes sont débitées » | `env.test.ts` — « le message dit ce qu'on risque » |
| La clé secrète reste exigée | garde préexistante, désormais couverte | `env.test.ts` — « la clé secrète reste exigée » |
| Sans prestataire, aucune clé réclamée | garde conditionnée à `PAYMENT_PROVIDER` | `env.test.ts` — « sans prestataire » |
| Cookie non sécurisé refusé en production | garde préexistante, désormais couverte | `env.test.ts` — « la production exige un cookie sécurisé » |
| Outils de développement interdits en production | garde préexistante, désormais couverte | `env.test.ts` — « les outils de développement » |
| `SameSite=none` sans `Secure` refusé en production | garde préexistante, désormais couverte | `env.test.ts` — « SameSite=none sans cookie sécurisé » |
| Base de données : URL ou composants | garde préexistante, désormais couverte | `env.test.ts` — « ni URL ni composants » |
| Secret de session d'au moins 32 caractères | `z.string().min(32)` | `env.test.ts` — « un secret de session trop court » |

## Push natif dans les applications empaquetées (ANN-005)

| Exigence | Implémentation | Test |
|---|---|---|
| Une application de store reçoit des notifications | `@capacitor/push-notifications` + FCM | vérifié au typage et au build ; livraison réelle à confirmer sur appareil |
| Le Web Push continue de servir les navigateurs | `transport` distingue les deux routes | `push-fcm.test.ts` + suite existante |
| Le transport ne se déduit pas de la plateforme | colonne `device_tokens.transport` | `0022_push_transport.sql` |
| Le JWT est réellement signé | `createSign("RSA-SHA256")` | `push-fcm.test.ts` — vérifié contre la clé publique |
| La clé PEM survit à une variable d'environnement | `replace(/\\n/g, "\n")` | `push-fcm.test.ts` — « les sauts de ligne échappés » |
| Un jeton mort disparaît | 404/403/`UNREGISTERED` → `unregistered` | `push-fcm.test.ts` — « un jeton mort est signalé » |
| Une panne passagère ne détruit rien | tout autre statut → `failed` | `push-fcm.test.ts` — « une panne passagère » |
| Un jeton d'accès refusé est renouvelé | 401 vide le cache | `push-fcm.test.ts` — « oublié, pas réutilisé en boucle » |
| Le jeton d'accès est réutilisé une heure | cache avec marge d'expiration | `push-fcm.test.ts` — « réutilisé tant qu'il est valide » |
| Le push ne fait jamais échouer ce qu'il annonce | aucun chemin ne lève | `push-fcm.test.ts` — « un réseau coupé ne lève pas » |
| Configuration partielle refusée au démarrage | `superRefine` sur les trois variables | `env.ts` |
| Un échec d'enregistrement ne dit pas « refusé » | exception distincte du refus utilisateur | `push.ts` — permission accordée mais jeton absent |

## Arbitrage (§84)

| Ce qui est promis | Où c'est tenu | Comment c'est vérifié |
|---|---|---|
| L'arbitre perçoit 300 UNO par séance dirigée | `REFEREE_SESSION_FEE_UNO`, versé par `payReferee` | `competition.test.ts` — le test lit la constante, jamais un nombre écrit à la main |
| L'arbitrage ne concerne que la UNO League | `assertRefereeableMode` refuse un mode non classé | `competition.test.ts` — « seules les sessions UNO League sont arbitrées » |
| Les séances ouvertes à un arbitre sont les seules séances de ligue | `openRefereeSlots` filtre `modeId = 'league'` | `referees.service.ts` |
