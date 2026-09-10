# UNO League

Application de gestion d'une ligue amateur de futsal : sessions, divisions,
statistiques, monnaie interne UNO et boutique de récompenses.

Webapp React empaquetable pour l'App Store et Google Play via Capacitor,
adossée à une API Node typée de bout en bout.

---

## Architecture

```
uno-league/
├── packages/shared/   Domaine métier : constantes, règles, schémas de validation
├── apps/api/          Node + Express + tRPC + Drizzle + MySQL/TiDB
└── apps/web/          Vite + React + Tailwind, empaquetable via Capacitor
```

`packages/shared` est la source de vérité unique du domaine. Le ratio
`10 UNO = 1 EUR`, les barèmes de récompense, la génération des créneaux et la
formule de départage du classement y sont définis une seule fois, et utilisés
tels quels par le serveur **et** par l'interface. Aucun écran ne peut afficher
un chiffre qui contredirait le serveur.

| Couche | Rôle |
|---|---|
| `apps/web` | affichage, navigation, validation de confort, appels API |
| `apps/api` | authentification, autorisation, règles métier, transactions |
| MySQL / TiDB | source de vérité persistante |

Les règles métier s'exécutent **exclusivement côté serveur**. Le client ne
décide de rien : ni un prix, ni une division, ni un solde.

---

## Démarrage

Prérequis : Node 22, pnpm 9, et un MySQL 8 (ou un cluster TiDB Cloud).

```bash
pnpm install

cp .env.example .env
# Renseignez au minimum DATABASE_URL et SESSION_SECRET.

pnpm db:migrate    # crée le schéma
pnpm db:seed       # jeu de démonstration (développement uniquement)

pnpm dev           # API sur :4000, application web sur :5173
```

Le seed crée **72 joueurs** (24 par division), **3 arbitres**, **2
superviseurs** — un joueur et un arbitre —, 10 produits
illustrés, 3 annonces, **17 sessions** couvrant tous les états — propositions
en attente de joueurs, réservations partiellement payées, sessions confirmées
avec équipes tirées, sessions terminées avec rapports validés, podiums et
récompenses — et **9 commandes** réparties sur les statuts atteignables, 9 avis
produits et 4 salles illustrées. Les sessions UNO League terminées portent leur
enchaînement de matchs réel : le vainqueur reste sur le terrain, l'équipe
entrante reste en cas de nul. Tous les comptes de démonstration partagent le
mot de passe `Demo2026!`.

Le **compte administrateur** est lui aussi inscrit à des sessions : un
historique à consulter, une place à régler dans une réservation, et deux
sessions jouées en attente de saisie. Le produit est donc testable de bout en
bout depuis ce seul compte.

Le jeu de démonstration emprunte les mêmes fonctions de service que
l'application : les soldes découlent du registre, les statistiques des
rapports validés. Il ne peut donc pas contenir d'état impossible.

Vingt-quatre joueurs par division et non quinze : **chaque session clôturée en
déplace dix** — cinq montent, cinq descendent. À seize, une division tombait
sous le seuil dès la deuxième session du calendrier.

### Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | API et application web en mode développement |
| `pnpm check` | vérification TypeScript des trois paquets |
| `pnpm test` | 190 tests unitaires et d'intégration |
| `pnpm build` | build de production |
| `pnpm db:check` | diagnostic de la connexion, du schéma et des migrations en attente |
| `pnpm db:migrate` | applique les migrations en attente |
| `pnpm db:seed` | insère le jeu de démonstration |
| `pnpm db:reset` | supprime toutes les tables, puis `pnpm db:migrate` (développement uniquement) |
| `pnpm push:keys` | génère une paire de clés VAPID pour les notifications push |

---

## Saisie des statistiques en visionnage

Une session UNO League enchaîne des matchs de dix minutes entre trois équipes
de cinq. Les relever après coup dans un tableau de compteurs — quinze joueurs
fois quatre statistiques fois le nombre de matchs — demande de tout mémoriser,
n'autorise aucun retour arrière, et perd tout si la page se recharge.

L'écran **Administration → Saisie vidéo** (`/admin/tracker`) prend le problème
dans l'autre sens : on relève des **actions horodatées** en regardant
l'enregistrement, et tout le reste s'en déduit.

| Ce qui se saisit | Ce qui se déduit |
|---|---|
| le buteur, puis le passeur | le score, les passes décisives |
| la défense, l'arrêt | les points au classement |
| qui entre au but | les buts encaissés par chaque gardien, son temps de jeu |
| le coup d'envoi dans la vidéo | l'horloge de match de chaque action |

Ce qui en découle :

- **Deux gestes par action.** On désigne le joueur, puis ce qu'il a fait. Un
  but enchaîne directement sur la désignation du passeur ; un arrêt se saisit
  d'un seul geste, le gardien en poste étant connu.
- **Le clavier va plus vite que le doigt.** Chiffres pour le joueur, lettres
  pour l'action, barre d'espace pour la pause, flèches pour revenir en
  arrière, `Ctrl+Z` pour annuler.
- **Rien ne se perd.** Chaque action est écrite localement avant d'être
  poussée par lots. Coupure réseau, page rechargée, onglet fermé : la file
  repart toute seule, et les écritures sont idempotentes — un lot rejoué
  n'écrit jamais deux fois.
- **Le score ne peut pas contredire les buteurs**, puisqu'il en est la somme.
  Le score relevé au tableau se saisit à part, comme contrôle : un écart
  bloque la publication au lieu de fausser le classement.
- **Les compositions changent en deux gestes** — reprendre celle de la séance
  précédente, chercher un nom, rééquilibrer d'un bouton — et un joueur se
  déplace d'une équipe à l'autre même en cours de séance.
- **Publier** reporte le tout au classement officiel : statistiques de
  carrière, XP, homme de la session, distinctions, montées et descentes. Le
  chemin est celui d'une session réservée, pas un second calcul parallèle.

Les récompenses en UNO ne sont pas versées par défaut : une feuille saisie en
visionnage relève souvent une séance encaissée hors de l'application, ou
rattrape un historique. La case existe, elle se coche sciemment.

---

## Décisions structurantes

**Authentification.** Mot de passe haché avec scrypt (N = 2^15, r = 8, p = 3,
une des configurations recommandées par l'OWASP). La session est un jeton
aléatoire de 32 octets dont seul le HMAC est stocké : une fuite de la table
`sessions` ne permet ni de rejouer ni de forger une session. Côté web, le
jeton voyage dans un cookie `httpOnly` inaccessible au JavaScript ; côté
application empaquetée, dans le stockage sécurisé de l'appareil. Aucun mot de
passe n'est jamais conservé côté client.

**Autorisation.** Trois niveaux de procédure tRPC : `publicProcedure`,
`protectedProcedure` et `adminProcedure`. Le rôle est relu en base à chaque
requête — un client ne peut pas devenir administrateur en modifiant un état
local.

**Registre financier.** Toute variation de solde passe par un point d'entrée
unique (`ledger.service.ts`). La ligne joueur est verrouillée pendant
l'opération, le solde après transaction est figé pour l'audit, et une clé
d'idempotence unique en base rend impossible le double débit. Un débit
supérieur au solde est refusé sans écrire la moindre ligne. Une contrainte
`CHECK` en base interdit physiquement un solde négatif.

**Paiements.** Le montant provient toujours de la session lue en base ; un
montant envoyé par le client est ignoré. Les paiements externes passent par un
adaptateur : l'intention est créée côté serveur, et seul un webhook signé fait
passer le paiement à l'état payé. Tant qu'aucun prestataire n'est configuré,
les moyens externes ne sont tout simplement pas exposés — pas de parcours de
réservation sans issue.

**Concurrence.** Les transitions d'état verrouillent la ligne concernée puis
relisent l'état réel en base. Deux joueurs qui visent la dernière place sont
sérialisés : un seul réussit, l'autre reçoit un conflit. Ce comportement est
couvert par un test d'intégration exécuté contre une vraie base.

---

## Tests

```bash
pnpm test
```

- **Tests de domaine** (`packages/shared/tests`) : créneaux horaires,
  conversions monétaires, formule de classement, tirage des équipes, machines
  à états, et agrégation des actions saisies en visionnage — score déduit des
  buteurs, buts encaissés attribués au gardien en poste, contrôles de
  cohérence.
- **Tests d'intégration** (`apps/api/tests`) : exécutés contre une base MySQL
  réelle, via des appels directs aux procédures tRPC. Ils couvrent les
  scénarios de recette E2E-001 à E2E-016 et les cas limites du cahier des
  charges : dernière place disputée simultanément, double clic sur « Payer »,
  achats concurrents sur un solde qui n'en permet qu'un, produit désactivé
  entre l'affichage et l'achat, double validation de match, file d'actions
  hors ligne rejouée après coupure, double publication d'une feuille de
  saisie.

Ces tests utilisent une base réelle et non des doublures : l'atomicité, les
verrous et les contraintes d'unicité n'existent que dans la base, et les
vérifier ailleurs ne prouverait rien.

Base de test par défaut : `mysql://uno:unolocal@127.0.0.1:3306/uno_league_test`,
surchargeable par `TEST_DATABASE_URL`.

---

## Documentation

- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) — mise en production, empaquetage
  iOS/Android, activation des paiements.
- [`docs/TRACABILITE.md`](docs/TRACABILITE.md) — correspondance entre les
  exigences du cahier des charges et leur implémentation.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — choix d'interprétation là où le
  cahier des charges laissait une marge.
