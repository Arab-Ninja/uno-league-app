# Décisions d'interprétation

Le cahier des charges est normatif, mais laisse une marge sur certains points.
Ce document consigne les choix faits, pour qu'ils soient discutables plutôt
qu'implicites.

---

## 1. Progression XP et niveaux

**Le cahier des charges impose** `level >= 1` et `xp >= 0` (§5), sans définir
la courbe.

**Choix retenu** — barème versionné dans `packages/shared/src/constants.ts` :

- 500 XP par niveau, `niveau = floor(xp / 500) + 1` ;
- gains par session validée : 50 XP de participation, 20 par but, 10 par
  passe, 5 par défense, 5 par arrêt, 100 pour l'homme du match.

Le niveau est toujours **dérivé** de l'XP, jamais stocké indépendamment : les
deux ne peuvent pas diverger. `XP_POLICY_VERSION` permet de faire évoluer le
barème sans réécrire l'historique.

---

## 2. Formule du classement général

**Le cahier des charges impose** (RANK-003) un départage par « un score de
classement déterministe » documenté dans le backend, sans en donner la
formule.

**Choix retenu** — la pondération demandée par le client :

```
points = 1,5 × buts + 1 × passes + 0,5 × défenses + 0,5 × arrêts
```

puis, à égalité, nom alphabétique et identifiant : les deux derniers critères
garantissent un ordre **total**, si bien que deux joueurs strictement ex aequo
conservent la même position d'un rafraîchissement à l'autre.

**L'homme du match pèse zéro.** Le barème énoncé ne cite que quatre
statistiques ; les MOTM restent affichés en colonne `M` du tableau, mais
n'entrent pas dans le total. Leur donner un poids arbitraire aurait faussé un
classement dont le client a fixé lui-même l'échelle. Une pondération de la
distinction se règle en une ligne (`RANKING_WEIGHTS.motm`) le jour où elle est
décidée.

La formule est exposée par l'API (`ranking.formula`), rappelée en pied du
tableau de classement et détaillée dans l'écran Informations : elle est
vérifiable par les joueurs. Version 2.

La note de la carte (50 à 99) dérive de ces mêmes points par une courbe de
saturation : elle suit donc automatiquement le classement, sans second
barème à maintenir.

---

## 3. Déduplication des créneaux

**Le cahier des charges impose** (CAL-005) l'unicité sur *lieu + date + heure
+ mode*, et liste comme cas limite « lieu identique mais mode différent au
même horaire » (§21.1).

**Choix retenu** — la clé d'unicité est exactement celle du cahier des
charges. Deux propositions de modes différents au même lieu et au même
horaire sont donc **autorisées**.

**Point à trancher avec vous** : un match amical de 14 h à 15 h et une session
League de 14 h à 16 h au même lieu se chevauchent physiquement. Si un lieu ne
dispose que d'un terrain, il faudrait refuser tout chevauchement horaire, et
pas seulement les doublons exacts. La règle actuelle suit le cahier des
charges à la lettre ; le changement est localisé dans
`proposals.service.ts` (`buildSlotKey`).

---

## 4. Récompenses affichées sur un match amical

**Le cahier des charges** donne un barème par division (§8.2) et précise que
le match amical n'a « aucun impact sur le classement » (§8).

**Choix retenu** — une session non classée n'affiche que les récompenses
réellement versées : meilleure équipe et participation. Afficher « meilleur
buteur : 150 UNO » sur un match dont les buts ne comptent pas serait
trompeur. Une session sans division utilise le barème D3.

---

## 5. Sortie d'une réservation

**Le cahier des charges** (CAL-008) autorise la sortie tant que la session est
au statut proposition, et laisse la politique de sortie d'une réservation
ouverte, avec pour défaut : interdiction sans intervention administrative.

**Choix retenu** — c'est ce défaut qui est appliqué. Un joueur ne peut pas
quitter une réservation, payée ou non ; le message d'erreur l'invite à
contacter un administrateur. Deux garde-fous supplémentaires :

- le créateur ne peut pas quitter une proposition à laquelle d'autres joueurs
  sont déjà inscrits ;
- une proposition vidée de tous ses participants est annulée et son créneau
  libéré.

---

## 6. Propositions expirées

**Le cahier des charges** liste « proposition expirée dont la date est
passée » comme cas limite (§21.1) sans prescrire de comportement.

**Choix retenu** — une tâche d'entretien s'exécute toutes les cinq minutes :

- une proposition ou réservation dont l'heure est passée sans avoir atteint
  son quota est **annulée**, et son créneau libéré ;
- une session confirmée dont l'heure est passée devient **terminée**.

---

## 7. Promotions et relégations

**Le cahier des charges** (RANK-005) impose des quotas configurables, jamais
codés en dur dans l'interface.

**Choix retenu** — les quotas sont des paramètres de l'appel
`admin.applySeasonLadder`, et la table `seasons` porte les valeurs par défaut
d'une saison. La montée s'applique à chaque échelon (D2 → D1, puis D3 → D2),
la descente également (D1 → D2, D2 → D3). Un joueur promu au cours de
l'opération n'est jamais relégué dans la foulée.

---

## 8. Notifications push

**Le cahier des charges** (ANN-003, ANN-004) exige les notifications push avec
préférences et anti-duplication.

**État actuel** — le socle est en place : table `device_tokens`, préférence
`pushEnabled` par joueur, et table `notification_deliveries` dont l'index
unique `(joueur, évènement, canal)` rend le doublon impossible. Les
notifications **in-app** sont opérationnelles.

**Reste à faire** — le branchement d'un fournisseur (FCM/APNs). Il se fait
naturellement au moment de l'empaquetage Capacitor, puisque les jetons
d'appareil ne sont délivrés que par une application installée. C'est un lot P1
au sens du §22.

---

## 9. Carte joueur (style FUT)

**Origine** — le modèle fourni est un CodePen : silhouette découpée en SVG,
note, poste, drapeau, logo de club, photo, nom et six statistiques.

**Écarts assumés par rapport au modèle**

- Les identifiants CSS (`#card`) deviennent des classes : plusieurs cartes
  coexistent sur un même écran, ce qu'un identifiant interdit. La silhouette
  SVG, elle, reste déclarée une seule fois pour tout le document, puisque
  `clip-path: url(#id)` référence un identifiant global.
- Les délais d'animation, échelonnés jusqu'à 3,2 secondes dans l'original,
  sont ramenés à 1,1 seconde. Trois secondes d'attente conviennent à une
  démonstration isolée, pas à un écran consulté quotidiennement.
- jQuery est remplacé par du React : aucune dépendance ajoutée.
- La carte n'affiche que le patronyme, comme une carte FIFA : un nom complet
  déborde de la largeur. Le nom entier figure sous la carte.

**Valeurs affichées**

| Emplacement | Source |
|---|---|
| Note (50-99) | calculée depuis le score de classement, barème versionné |
| Poste | champ `position` choisi par le joueur (GB, DEF, MIL, ATT) |
| Drapeau | nationalité du profil |
| Club | division |
| Aspect | division : D1 or, D2 argent, D3 bronze |
| Six statistiques | buts, passes, défenses, arrêts, MOTM, sessions jouées |

**Note globale** — le cahier des charges n'en définit aucune. Le barème retenu
part de 50 pour un joueur sans statistique et tend vers 99 sans jamais
l'atteindre, avec une progression logarithmique : les premiers matchs font
gagner beaucoup, les suivants de moins en moins. Trois propriétés vérifiées
par les tests : plancher à 50, plafond à 99, croissance stricte.

**Photo** — un portrait pris au téléphone est rectangulaire, là où les cartes
FUT utilisent des découpes détourées. Un masque estompe le bord gauche et le
bas pour que la photo se fonde dans le dégradé quel que soit son cadrage.
L'image est réduite à 800 px avant envoi ; le serveur revalide type, taille et
octets de tête, et choisit lui-même le nom du fichier (SEC-005).

**Police** — Roboto Condensed est embarquée dans l'application plutôt que
chargée depuis Google Fonts : une dépendance réseau serait un point de
défaillance dans l'application empaquetée. Seuls les sous-ensembles latins
sont retenus.

## 10. Comptes et données de démonstration

Le seed crée quarante-huit joueurs — seize par division, le minimum pour
qu'une session de ligue en réunisse quinze — partageant le mot de passe
`Demo2026!`. Ces comptes n'ont aucune valeur en production : `db:seed` refuse
de s'exécuter si la base contient déjà des joueurs, et la route
d'administration correspondante est indisponible en production.

**Le jeu de démonstration ne fabrique aucun état à la main.** Paiements,
tirages d'équipes, rapports de match, validations, clôtures et commandes
passent par les mêmes fonctions de service que l'application : les soldes
découlent du registre, les statistiques des rapports validés, les récompenses
du barème. Seule l'insertion des propositions est écrite directement en base,
parce qu'une session **passée** ne peut pas être créée par `createProposal`
(délai minimum de deux jours, CAL-004). Conséquence utile : une incohérence
dans le jeu de démo serait une incohérence réelle du domaine, donc un bug à
corriger.

Les scores et statistiques viennent d'un générateur pseudo-aléatoire à graine
fixe : deux bases fraîchement semées sont identiques, ce qui rend les
captures d'écran et les recettes manuelles comparables d'une machine à
l'autre.

---

## 11. Visuels des produits de démonstration

**Première approche, écartée** — pointer vers un service d'images public
(`picsum.photos`). Hors ligne, derrière un proxy d'entreprise, ou le jour où
ce service répond mal, tout le catalogue s'affichait cassé et le carrousel
devenait intestable.

**Choix retenu** — le seed **fabrique** les images (PNG, dégradé teinté par
produit, composition différente par vue) et les dépose par
`storeImage`, la même fonction que le téléversement administrateur : même
validation, même nommage, même URL publique, et le pilote S3 fonctionne comme
le pilote local. Le catalogue de démonstration n'a donc aucune dépendance
réseau externe.

En complément, tout visuel de produit passe côté web par `ProductImage`, qui
retombe sur un pictogramme neutre si l'image devient injoignable : une URL
saisie par l'administration et cassée plus tard n'affiche jamais l'icône de
lien brisé du navigateur.
