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

---

## 12. Montées et descentes : à la session, pas à la saison

**Le client demande** que « les 5 joueurs avec le plus de points montent en
division supérieure, les 5 avec le moins de points descendent », et que « ce
changement se montre sur les résultats de sessions UNO League ».

**Choix retenu** — le mouvement est décidé **à chaque session classée**, pas
en fin de saison. C'est ce qu'impose la seconde phrase : un classement affiché
sur la feuille d'une session ne peut porter que sur cette session.

Une session réunit quinze joueurs en trois équipes de cinq : le tiers de tête
monte, le tiers de queue descend, le tiers médian se maintient. Pour une
session incomplète, c'est le **tiers** qui est conservé, pas le chiffre
absolu : appliquer « cinq et cinq » à huit joueurs ferait bouger tout le
monde, ce qui ne voudrait plus rien dire.

Deux garde-fous :

 - **les extrémités ne bougent pas.** Personne ne monte au-dessus de la D1 ni
   ne descend sous la D3 ; le mouvement est alors enregistré comme « se
   maintient », ce qui est la vérité affichée au joueur ;
 - **le mouvement est figé à la clôture.** Rang, points et mouvement sont
   écrits sur la ligne de participation : la feuille d'une session passée ne
   change plus, même si le joueur change de division ensuite.

Le mécanisme de fin de saison (`applySeasonLadder`, RANK-005) reste
disponible pour un ajustement global décidé par l'administration.

---

## 13. L'homme du match est calculé, plus saisi

**Le client demande** que l'homme du match soit « celui qui accumule le plus
de points, toutes statistiques confondues, à l'issue d'une session ».

**Choix retenu** — la distinction est **dérivée** du classement de session,
au barème général. Elle disparaît donc du formulaire de saisie : la laisser
saisissable aurait permis deux vérités contradictoires — un homme du match
désigné à la main et un autre au sommet du classement.

Conséquence sur le barème : l'homme du match ne pèse rien dans le calcul des
points (`RANKING_WEIGHTS.motm = 0`), et pour cause — il est lui-même décerné
d'après ces points. L'inclure reviendrait à récompenser deux fois la même
performance.

Le joueur retenu est écrit sur la proposition (`motm_player_id`) : le podium
d'une session passée ne bouge pas si le barème évolue.

---

## 14. Le meilleur défenseur compte aussi les arrêts

Le critère était le seul nombre de défenses, ce qui écartait mécaniquement les
gardiens d'une distinction qui les concerne au premier chef. Il devient
**défenses + arrêts** : un gardien protège la même cage avec ses mains qu'un
défenseur avec ses pieds.

---

## 15. Un match amical ne verse rien

**Le client demande** qu'« en match amical, il n'y ait pas de récompense UNO »
et que « les points UNO et divisions ne s'appliquent pas aux matchs amicaux ».

**Choix retenu** — un mode non classé ne verse **aucune** récompense : ni
participation, ni meilleure équipe, ni distinction. La liste affichée sur la
fiche de session est donc vide, et non pas amputée : annoncer une prime qui ne
sera jamais créditée serait une promesse faite au joueur avant qu'il ne paie
sa place. Aucun mouvement de division n'est enregistré non plus — le champ
reste nul plutôt que « se maintient », car la question ne se pose pas.

**L'expérience, elle, reste acquise.** L'XP mesure le temps de jeu, pas la
performance en compétition : un amical est une session jouée, et le compteur
de sessions l'enregistre. Seuls le classement, les UNO et les divisions
l'ignorent.

---

## 16. Une session jouée n'est plus clôturée automatiquement

La tâche d'entretien passait à « terminée » toute session dont l'heure était
dépassée. C'était sans conséquence tant que la clôture ne faisait rien ; elle
décide désormais des distinctions, verse les récompenses et fait monter ou
descendre les joueurs.

**Choix retenu** — une session dont l'heure est passée **reste confirmée** et
rejoint la file de saisie de l'administration. Seule une saisie de résultats
peut la terminer. Clôturer automatiquement distribuerait des récompenses pour
une session dont on ignore tout, et figerait un classement vide.

Reste automatique : l'annulation d'une proposition dont l'heure est passée
sans quota atteint, et le signalement des paiements en retard.

---

## 17. Délai de paiement et remplaçants

**Le client demande** que les joueurs d'une réservation aient 24 heures pour
payer, qu'ils soient relancés au-delà, et qu'un joueur non inscrit puisse
« se proposer comme remplaçant » afin de reprendre une place non réglée —
« cela permet d'éviter les annulations ».

**Choix retenu :**

 - **l'horloge démarre à la formation de la réservation**, pas à l'affichage.
   L'échéance est écrite en base (`payment_deadline`) : la calculer au vol
   aurait donné une échéance qui glisse à chaque rafraîchissement ;
 - **on peut se déclarer remplaçant dès la réservation formée**, sans
   attendre l'échéance — sinon la file serait toujours vide au moment où elle
   devient utile ;
 - **la place est saisie avant d'être payée.** Deux remplaçants simultanés ne
   peuvent donc pas être débités tous les deux : le second se heurte au
   verrou, puis au refus « place déjà reprise », sans avoir rien payé ;
 - **la division s'applique aux remplaçants** comme aux inscrits : sinon la
   règle se contournerait par la file d'attente ;
 - **le serveur seul décide de ce qui est reprenable.** Comparer des dates
   côté client ferait dépendre une règle métier de l'horloge et du fuseau
   d'un téléphone.

La place change de titulaire sans passer par une suppression : le compteur de
participants reste juste, et l'historique dit qui a cédé sa place à qui
(`replaced_player_id`).

---

## 18. Deux journaux distincts : audit et évènements

L'administration demande d'être notifiée de chaque évènement — réservations,
sessions, achats, transferts, commandes. Un journal d'audit existait déjà.

**Choix retenu** — deux tables, deux usages. L'**audit** répond à « qui a fait
quoi », pour la responsabilité : il est écrit dans la transaction de
l'opération et ne se lit qu'en cas de litige. Le **flux d'évènements** répond
à « qu'est-il arrivé », pour l'exploitation quotidienne : il se lit tous les
jours, se marque comme lu, et se filtre par famille. Les fusionner aurait
donné un journal illisible pour les deux usages.

**Une notification ne fait jamais échouer l'opération qu'elle observe.** Une
écriture qui échoue est journalisée côté serveur et l'appelant continue :
débiter, réserver ou livrer compte, notifier est accessoire.

**Mais elle doit écrire sur la bonne connexion.** La table porte une clé
étrangère vers `players` : écrire sur une autre connexion pendant qu'une
transaction détient un verrou exclusif sur la ligne du joueur bloque la
vérification de cette clé jusqu'au délai d'attente — cinquante secondes par
notification, puis un échec. Le paramètre `executor` est donc **obligatoire**,
sans valeur par défaut, pour que chaque appelant tranche explicitement.
