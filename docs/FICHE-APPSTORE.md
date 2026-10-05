# Fiche App Store — textes et réponses

Le pendant de `FICHE-PLAY.md` pour Apple. Tout ce qui se recopie dans App Store
Connect est ici, dans l'ordre des écrans. Les blocs de code se collent **tels
quels** ; le texte autour est de l'explication.

Ce qui ne figure **jamais** dans ce fichier : les identifiants du compte de
démonstration et les clés `.p8`. Ils se saisissent directement dans App Store
Connect, dans Render ou dans les secrets GitHub.

---

## Identité de l'application

À la création (*Apps → + → Nouvelle app*) :

| Champ | Valeur |
|---|---|
| Plateformes | iOS |
| Nom (30 caractères max) | `UNO League` |
| Langue principale | Français |
| Identifiant de lot | `app.unoleague.mobile` |
| SKU | `unoleague-ios-1` |
| Accès utilisateur | Accès complet |

Puis, dans *Informations sur l'app* :

| Champ | Valeur |
|---|---|
| Sous-titre (30 caractères max) | `Ta ligue de futsal à Bruxelles` |
| Catégorie principale | Sports |
| Catégorie secondaire | *(aucune)* |
| Droits sur le contenu | « Ne contient pas de contenu de tiers » |
| Classification par âge | voir plus bas |

L'application est **iPhone seulement** (le projet ne déclare pas l'iPad) : Apple
ne demande donc que des captures d'iPhone.

---

## Captures d'écran

Six captures au format **iPhone 6,5″** (1284 × 2778), l'emplacement que la fiche
demande. Apple les réduit lui-même pour les écrans plus petits : un seul format
suffit. Elles sont à déposer dans cet ordre :

1. `1-accueil.png` — « Ton prochain match »
2. `2-calendrier.png` — « Rejoins une séance »
3. `3-session.png` — « Équipes, prix, récompenses »
4. `4-profil.png` — « Ta carte UNO »
5. `5-classement.png` — « Monte de division »
6. `6-portefeuille.png` — « Gagne des points UNO »

Elles viennent du jeu de démonstration : joueurs et visages fictifs.

---

## Texte promotionnel (170 caractères max)

Modifiable à tout moment sans nouvelle revue.

```
Propose une séance, remplis le terrain, paie ta place et grimpe au classement. Toute ta ligue de futsal tient dans ton téléphone.
```

---

## Description (4 000 caractères max)

```
UNO League est l'application de la ligue de futsal amateur de Bruxelles. Elle remplace les groupes de discussion, les tableurs partagés et les rappels de paiement par un seul endroit où tout se décide.

PROPOSER ET REJOINDRE UNE SÉANCE

Choisis une salle, une date, un créneau : la proposition est ouverte. Les autres joueurs s'inscrivent. Dès que le terrain est complet, la séance passe en réservation et chacun règle sa place. Plus personne n'a à relancer qui que ce soit.

Un joueur n'a pas payé dans les 24 heures ? Sa place s'ouvre aux remplaçants. Une séance ne tombe plus à cause d'un seul absent.

Tu peux aussi garder une séance privée, n'y inviter que tes amis, ou te servir du planificateur pour un match organisé en dehors de la ligue.

PAYER SA PLACE

Par carte bancaire, Apple Pay, Bancontact, ou avec tes points UNO. Chaque mouvement apparaît dans ton portefeuille, avec sa raison.

TA CARTE DE JOUEUR

Photo, poste, nationalité, note générale. Elle évolue à chaque séance : buts, passes, arrêts, défenses. Le détourage de la photo se fait sur ton téléphone — ton visage n'est envoyé nulle part.

CLASSEMENT ET DIVISIONS

Trois divisions. À la clôture d'une séance, les premiers montent, les derniers descendent. Les statistiques arrivent dans ton historique, et une notification te prévient qu'elles sont prêtes.

CLUBS ET TOURNOIS

Fonde un club, recrute, compose ton cinq et défie les autres clubs. Les tournois opposent les clubs de la ligue, du premier tour à la finale.

BOUTIQUE

Équipement de la ligue, échangeable contre tes points UNO. Tu peux aussi reverser tes points à une association partenaire.

RESTER AU COURANT

Une séance confirmée, un paiement attendu, une place qui se libère, des statistiques disponibles : l'application te prévient de ce qui te concerne. Jamais de promotion.

UNE LIGUE RESPECTUEUSE

Tu peux signaler un message ou un avis, et bloquer un joueur, en deux gestes. La ligue examine chaque signalement.

—

UNO League se joue dans de vraies salles. Les points UNO servent à régler des séances et des articles physiques : ce ne sont ni une monnaie, ni un bien numérique.

Inscription réservée aux personnes majeures.
```

---

## Mots-clés (100 caractères max, séparés par des virgules)

```
futsal,football,ligue,bruxelles,brussels,match,équipe,classement,five,terrain,sport,joueur,club
```

*95 caractères.* Ni « UNO » ni « League » : le nom de l'application est déjà
indexé, les répéter gaspille de la place.

---

## Adresses

| Champ | Valeur |
|---|---|
| URL d'assistance | `https://unoleague.be/conditions.html` |
| URL marketing | `https://unoleague.be` |
| Politique de confidentialité | `https://unoleague.be/confidentialite.html` |
| Copyright | `2026 VIP Drivers SRL` |

La page des conditions donne l'éditeur et l'adresse de contact : c'est ce
qu'Apple attend d'une page d'assistance.

---

## Confidentialité de l'app (« étiquettes »)

*App Store Connect → Confidentialité de l'app → Commencer.*

**Collectez-vous des données ?** → Oui.

Pour **chaque** type ci-dessous : *lié à l'identité de l'utilisateur* → **Oui** ;
*utilisé pour le suivi* → **Non** ; finalité → **Fonctionnalités de l'app**, et
rien d'autre.

| Catégorie Apple | Type |
|---|---|
| Coordonnées | Nom |
| Coordonnées | Adresse e-mail |
| Coordonnées | Adresse physique *(facultative : livraisons de la boutique)* |
| Contenu utilisateur | Photos ou vidéos *(photo de la carte de joueur)* |
| Contenu utilisateur | Autre contenu utilisateur *(messages de club, avis)* |
| Identifiants | Identifiant utilisateur |
| Achats | Historique des achats *(places réglées, commandes)* |
| Autres données | Autres types de données *(date de naissance, nationalité)* |

Deux types de plus, mais **non liés** à l'identité (*lié* → **Non** ; *suivi* →
**Non** ; finalité → **Fonctionnalités de l'app**). Ils venaient du greffon des
mises à jour à chaud quand il passait par Capgo : numéro d'installation tiré au
hasard, versions de l'app et d'iOS, réussite ou échec de chaque mise à jour —
jamais le compte du joueur. **Depuis la 1.0.6**, la demande de mise à jour va à
notre propre serveur, qui n'en garde rien, et les statistiques sont coupées : ces
deux lignes peuvent être retirées à la prochaine version (les laisser n'est pas
une faute, déclarer plus que nécessaire est permis) :

| Catégorie Apple | Type |
|---|---|
| Identifiants | Identifiant de l'appareil |
| Diagnostics | Autres données de diagnostic |

**Ce qu'il ne faut pas déclarer**, pour les mêmes raisons que chez Google :

- **Informations de paiement** — saisies chez Stripe, l'application n'en reçoit
  rien ;
- **données biométriques ou visage** — l'analyse de la photo se fait sur
  l'appareil, rien n'est transmis avant la photo finale validée ;
- **localisation, contacts, historique de navigation, données de santé** —
  jamais lus ;
- **suivi publicitaire** — aucun ; l'application ne demande pas la permission
  de suivi (ATT).

---

## Classification par âge

Le questionnaire d'Apple, réponse par réponse :

- Violence, horreur, contenu sexuel, nudité, grossièretés, drogues, alcool,
  tabac, thèmes médicaux → **Aucun**.
- Jeux d'argent, jeux d'argent simulés, concours → **Non**.
- Accès Web sans restriction → **Non**.
- **Contenu généré par les utilisateurs / messagerie → Oui** (discussions de
  club, avis). Le déclarer est obligatoire ; l'application a ce qu'Apple
  demande en échange : filtre, signalement, blocage, conditions acceptées.
- Publicité → **Non**.

Puis, puisque l'inscription est réservée aux majeurs : choisir la classification
**18+** si l'écran propose de relever l'âge minimal. La fiche dit alors la même
chose que l'écran d'inscription.

---

## Prix et disponibilité

- Prix : **Gratuit**.
- Disponibilité : **Belgique** au minimum ; ajouter la France, les Pays-Bas et
  le Luxembourg ne coûte rien et sert les joueurs de passage.
- Achats intégrés : **aucun** à créer (voir les notes de revue).

---

## Informations pour la revue

*Version → Informations sur la revue de l'app.*

- **Connexion requise** → Oui. Saisissez l'identifiant et le mot de passe du
  **compte de démonstration** déjà utilisé pour Google Play, directement dans
  les champs prévus. Ils n'entrent jamais dans le dépôt.
- **Coordonnées** → votre nom, `contact@unoleague.be`, votre numéro.
- **Notes** — en anglais, la langue des évaluateurs. C'est aussi le texte de
  la réponse au message d'Apple du 2 octobre 2026 (« Guideline 2.1 — Information
  Needed ») : Apple demande de le reprendre ici pour les prochaines versions.
- **Pièce jointe** → la vidéo d'écran enregistrée sur l'iPhone (voir plus bas).

```
UNO League - information for App Review

1. SCREEN RECORDING
Attached. Recorded on an iPhone running the latest iOS, with the build under review. It starts by launching the app and shows: account registration, account deletion, login with the demo account, the calendar and joining a session, an order in the shop paid with UNO points and its cancellation, and a product review reported and its author blocked.

2. PURPOSE AND AUDIENCE
UNO League is the app of an amateur futsal (indoor 5-a-side football) league in Brussels, Belgium, run by VIP Drivers SRL, for adult players (18+). Organising a game usually means group chats, spreadsheets and chasing people for money, and a game falls through when one player drops out. In the app, a player proposes a session at a partner sports hall, others join, and once the pitch is full each player pays for their place. An unpaid place reopens to substitutes after 24 hours. Results, statistics, rankings and divisions are kept in the app. Players can also form clubs, play club matches and tournaments, and order league merchandise.

3. ACCESSING THE MAIN FEATURES
Sign in with the demo account given in the Sign-In Information fields: a regular player account on the live service, credited with 1,000 UNO points. There is one account type; no sample files are needed.
- Calendar: open a proposal, tap Join; it can be undone on the same screen. Payment is requested only once a session is full.
- Profile: player card, statistics, history, wallet.
- Shop: order with UNO points; an unconfirmed order can be cancelled from the profile and the points are refunded.
- Club tab: create or join a club, club chat, matches, tournaments.
- "..." on any message or review by another player: report it or block its author.
- Profile: blocked players, contact us, terms, delete my account (completed in the app after password confirmation).

4. EXTERNAL SERVICES
- Stripe: payment for session places (card, Apple Pay, Bancontact) via Stripe Checkout.
- Render: hosting of the server.
- TiDB Cloud: database.
- Brevo: transactional e-mails (password reset, sessions, orders).
- Apple Push Notification service: notifications.
- Over-the-air updates of the app's bundled web content (bug fixes), within the features reviewed, served from our own server (unoleague.be) with the open-source Capacitor Updater plugin.
- Google Maps: opened by a link for directions to a sports hall.
No third-party sign-in, no advertising or analytics SDK, no AI service. Photo framing and background removal use on-device models (Google MediaPipe) bundled in the app; only the final photo, confirmed by the user, is uploaded.

5. REGIONAL DIFFERENCES
None: the app works the same in every region where it is available. Its sessions and sports halls are in Brussels, prices are in euros, and the interface is in French, English and Dutch.

6. REGULATION AND THIRD-PARTY MATERIAL
Not a regulated industry, and no third-party protected material: the name, logo and content belong to the league, and player photos are uploaded by the players themselves.
Payments (Guideline 3.1.3(e)) buy only real-world services and physical goods: a place in a session played in a physical sports hall, and merchandise shipped to the player. Stripe processes them.
UNO points cannot be bought and cannot be cashed out. They are earned by playing and spent on session places or merchandise; they unlock no digital content. Two clubs may agree to put points from their club funds on a match they play themselves, the winning club receiving them; there is no betting on third-party events and no game of chance.

USER-GENERATED CONTENT (Guideline 1.2)
Terms with zero tolerance accepted at sign-up (https://unoleague.be/conditions.html), automatic filter of offensive words, report and block on every message and review, moderation queue for the league's administrators, who act within 24 hours.

DEMO ACCOUNT
The calendar shows real sessions: please leave any session you join, so that a real player keeps the place.
```


---

## La vidéo pour la revue

Apple la demande aux comptes développeur récents. Elle est enregistrée sur
l'iPhone (Centre de contrôle → Enregistrement de l'écran), avec l'iPhone à
jour, en une seule prise de trois à quatre minutes, sans montage.

**Avant d'enregistrer**

- Depuis **votre** compte : écrire un avis sur un produit de la boutique. C'est
  lui que le compte démo signalera puis bloquera.
- Vérifier qu'au moins une proposition est ouverte dans le calendrier.
- Prévoir une seconde adresse e-mail pour le compte créé pendant la vidéo.
- Se déconnecter de l'application, puis revenir à l'écran d'accueil de
  l'iPhone.

**Pendant l'enregistrement**

1. Toucher l'icône UNO League : l'application démarre.
2. **Créer un compte** avec la seconde adresse : formulaire, photo, case des
   conditions cochée.
3. Profil → **Supprimer mon compte** → mot de passe → confirmer. Retour à
   l'écran de connexion.
4. Se connecter avec le **compte démo**.
5. Accueil, puis Calendrier : ouvrir une proposition → **Rejoindre la
   session** → **Quitter la session**.
6. Profil : la carte, puis le portefeuille.
7. Boutique : commander un article **avec les points UNO** → Profil → **Mes
   commandes** → annuler la commande (les points reviennent).
8. Boutique : ouvrir le produit qui porte votre avis → « ⋯ » → **Signaler cet
   avis** → choisir un motif → envoyer → **Bloquer** → l'avis disparaît.
9. Profil → **Joueurs bloqués** → **Débloquer**. Montrer **Nous contacter** et
   les conditions.

**Après**

- Administration → Modération : classer le signalement.
- Vérifier que le compte démo n'est inscrit à aucune séance.

---

## Avant d'appuyer sur « Soumettre »

- [ ] Le compte de démonstration a des points UNO et des propositions ouvertes
      dans le calendrier. C'est un compte de production : les séances sont
      réelles.
- [ ] Après la revue : retirer le compte démo des séances qu'il aurait
      rejointes, annuler les commandes boutique qu'il aurait passées (le
      solde UNO est rendu).
- [ ] La migration `0036_moderation` est appliquée en production (`pnpm db:migrate`).
- [ ] Les variables `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` sont sur
      Render, et une notification de test est arrivée sur l'iPhone TestFlight.
- [ ] La mise à jour à chaud qui contient la modération est publiée (`pnpm ota`)
      ou le binaire a été construit après son arrivée sur `main`.
- [ ] Publication **manuelle** choisie dans « Publication de la version ».
