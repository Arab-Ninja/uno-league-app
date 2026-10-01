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

Six captures au format **iPhone 6,9″** (1320 × 2868), à déposer dans cet ordre.
Apple les réduit lui-même pour les écrans plus petits : un seul format suffit.

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
- **Notes** — en anglais, la langue des évaluateurs :

```
UNO League is the app of an amateur futsal league in Brussels, Belgium. Players propose sessions at partner sports halls, join them, pay for their place and follow results and rankings.

DEMO ACCOUNT
The demo account above is a regular player account on the live service, credited with 1,000 test UNO points. The proposals shown in the calendar are real futsal sessions in Brussels: joining one is free and can be undone at any time from the session screen (payment is only requested once a session is full). Please leave any session you join, so that a real player keeps the place.

PAYMENTS (Guideline 3.1.3(e))
Payments buy real-world services and physical goods only: a place in a futsal session played in a physical sports hall, and league merchandise shipped to the player. UNO points are a prepaid balance for those same real-world sessions and goods, also earned as rewards for real matches. They cannot unlock any digital content, feature or advantage in the app. Card, Apple Pay and Bancontact payments are processed by Stripe.

USER-GENERATED CONTENT (Guideline 1.2)
Users can post club chat messages and product reviews. The app includes:
- terms of use accepted at sign-up, with zero tolerance for objectionable content (https://unoleague.be/conditions.html);
- an automatic filter that masks offensive words before posting;
- a "..." button on every message and review from another player, to report the content or block its author;
- a moderation queue for the league's administrators, notified instantly, who remove content within 24 hours;
- contact details in Profile > Contact us.

ACCOUNT DELETION (Guideline 5.1.1(v))
Profile > Delete my account. The deletion is completed in the app after password confirmation.

CAMERA AND PHOTOS
Used only to take or choose the player card photo. Face framing and background removal run entirely on the device; only the final photo, confirmed by the user, is uploaded.

NOTIFICATIONS
Session confirmations, payment reminders, freed places and available statistics. No promotional notifications.

The app requires users to be 18 or older.
```

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
