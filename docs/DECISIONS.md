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

**Choix retenu** — le **Web Push** (VAPID), pas un fournisseur propriétaire.
Il fonctionne partout où l'application tourne : navigateur de bureau, Android,
et iPhone dès lors que l'application est ajoutée à l'écran d'accueil (iOS 16.4).
Aucun compte Firebase ni certificat Apple n'est nécessaire pour commencer, et
la même implémentation servira dans l'enveloppe Capacitor.

**Le push complète les notifications in-app, il ne les remplace pas.** Un
joueur qui refuse la permission, change de téléphone ou vide son navigateur
doit retrouver la totalité de ses notifications dans l'application. L'envoi
push est donc déclenché **après** l'écriture en base, et son échec n'annule
rien : `pushToPlayer` ne lève jamais.

**L'abonnement appartient à l'appareil, pas au compte.** Un joueur peut être
abonné sur son téléphone et pas sur son ordinateur ; l'écran de réglage
affiche le nombre d'appareils abonnés plutôt que de laisser croire à un
interrupteur global. Un endpoint auquel le service de push répond 404 ou 410
est supprimé à la volée : c'est ainsi qu'on nettoie les appareils perdus.

**L'anti-duplication précède l'envoi.** `notifyPlayer` s'arrête sur violation
de l'index unique `(joueur, évènement, canal)` *avant* de pousser : une
opération rejouée ne fait pas sonner deux fois le téléphone.

**Reste à faire pour le natif** — dans l'application empaquetée, iOS accepte
le Web Push d'une WebView installée, mais les jetons APNs/FCM natifs ouvrent
des possibilités supplémentaires (badges, notifications silencieuses). La
table `device_tokens` est prête pour ce jour-là ; ce n'est pas un préalable
à la mise en production.

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

---

## 19. L'arbitre est un rôle exclusif, et il est payé

**Le client demande** qu'on puisse choisir « joueur » ou « arbitre » à
l'inscription, qu'un arbitre se propose sur une ou plusieurs sessions UNO
League, qu'il n'y en ait **qu'un seul par session**, et qu'il ne paie pas sa
place.

**Choix retenu :**

 - **le type de compte est exclusif.** Un arbitre ne rejoint pas de session
   comme joueur : il n'a ni division, ni classement, ni montée/descente. Un
   compte mixte aurait posé une question sans réponse — un arbitre qui joue
   la session qu'il arbitre fausse tout, et le cahier des charges dit
   « ne participera qu'en tant qu'arbitre » ;
 - **ne pas payer ne suffit pas.** Arbitrer deux heures est un travail ; la
   session verse `REFEREE_SESSION_FEE_UNO` (150 UNO) à sa clôture, avec la
   même clé d'idempotence que les récompenses joueurs
   (`reward:session:<id>:referee`). Gratuit mais non rémunéré, le rôle se
   serait vidé faute de volontaires ;
 - **l'unicité est tenue par la base, pas par l'écran.** La colonne
   `proposals.referee_player_id` est unique par nature (une seule valeur), et
   la mise à jour porte une condition `IS NULL` en plus du verrou de
   proposition : deux arbitres qui se proposent à la même seconde ne peuvent
   pas être acceptés tous les deux, le second reçoit « un arbitre s'est déjà
   proposé » ;
 - **l'arbitre est affiché comme un joueur**, avec sa carte FUT — mais verte,
   avec le même dégradé et la même découpe que les autres. Sa note est son
   nombre de sessions arbitrées, son poste « ARB ». Un rôle qui n'aurait pas
   de carte aurait été un rôle de seconde classe ;
 - **il ne compte pas dans le quota.** Quinze joueurs restent quinze joueurs :
   l'arbitre s'ajoute, il ne prend la place de personne.

---

## 20. Les matchs d'une session ne sont pas connus d'avance

**Le client décrit** le déroulement réel d'une session UNO League : deux
heures, des matchs de dix minutes en nombre indéterminé, **le vainqueur reste
sur le terrain**, et **en cas de nul c'est l'équipe entrante qui reste**.

**Ce que cela interdit** — générer la grille des matchs à la formation de la
réservation. Le deuxième match dépend du résultat du premier ; une grille
écrite d'avance serait fausse dès le coup d'envoi.

**Choix retenu** — la génération des équipes ne crée que **le match
d'ouverture** (A contre B). Chaque match suivant est ajouté par
l'administration au moment de la saisie, avec un enchaînement **suggéré** par
`nextPairing` : l'équipe qui reste (vainqueur, ou équipe entrante si nul)
affronte l'équipe qui vient de se reposer. La suggestion est modifiable —
c'est le terrain qui fait foi, pas le calcul.

`nextPairing` vit dans `packages/shared` et non dans un service : c'est une
règle du jeu, pure et testable, et l'écran d'administration l'utilise pour
afficher la même suggestion que celle qui sera enregistrée.

**La composition des équipes reste modifiable** tant qu'aucun match n'est
validé. Le tirage automatique équilibre sur le papier ; sur le terrain, un
joueur arrive en retard, un autre se blesse. Après la première validation,
elle est figée : les statistiques sont déjà rattachées à une équipe, les
déplacer réécrirait un résultat acquis.

**Ces règles ne valent qu'en UNO League.** Un amical n'a ni classement ni
enchaînement à tenir : `addMatch` refuse les modes non classés.

---

## 21. Apple Pay n'est pas un moyen de paiement à part

**Le client demande** les paiements en euros : Bancontact, carte de
crédit/Revolut, « et surtout Apple Pay ».

**Choix retenu** — trois options à l'écran seulement : points UNO, carte, et
Bancontact. **Apple Pay et Google Pay ne sont pas des moyens de paiement
distincts** : ce sont des porte-cartes. Stripe les propose automatiquement
dans le tunnel `card`, dès lors que l'appareil en dispose et que le domaine
est vérifié. Les ajouter comme boutons séparés aurait produit un écran plus
long et deux boutons morts sur les appareils qui ne les gèrent pas.

L'intitulé le dit franchement — « Carte, Apple Pay, Google Pay » — et le
libellé d'aide explique que le choix se fait à l'étape suivante.

**Il reste une chose à faire hors du code** : déclarer le domaine chez Stripe
(*Payment method domains*) pour qu'Apple Pay s'affiche. C'est documenté dans
`docs/DEPLOIEMENT.md` ; sans cela le tunnel fonctionne, mais le bouton Apple
Pay reste absent.

**Le natif viendra plus tard.** Dans l'application empaquetée, Apple Pay
s'affiche déjà via le navigateur système ; une intégration native (feuille de
paiement Apple, sans passer par une page web) demande un identifiant marchand
et un certificat, et se fera une fois le projet stabilisé — décision du
client.

**Le retour de paiement n'est jamais une preuve.** L'URL de retour porte
`?paiement=succes`, mais l'application se contente d'attendre et de
rafraîchir : seul le webhook signé de Stripe crédite une place. Un joueur qui
tape l'URL à la main ne paie rien.

---

## 22. Chaque ligne du portefeuille mène quelque part

**Le client demande** « un peu de détail pour chaque ligne » de l'historique :
une participation doit ouvrir la session, un achat doit ouvrir la commande.

**Choix retenu** — le lien est **résolu par le serveur**, pas deviné par
l'écran. Le registre stocke déjà un `reference_type` et un `reference_id` ;
`resolveTransactionLinks` les traduit en une destination et un libellé lisible
(« Session du 12 mars », « Commande #14 », le nom du joueur pour un
transfert), en trois requêtes groupées quelle que soit la taille de la page.

Reconstituer ce libellé côté client aurait obligé l'application à connaître le
schéma de la base et à faire une requête par ligne.

**Le transfert est le cas particulier.** La ligne de débit de l'expéditeur n'a
pas de `reference_id` — la référence, c'est l'autre joueur. Elle est donc
traitée avant le filtre qui écarte les lignes sans référence, et pointe vers
le profil de la contrepartie, dans un sens comme dans l'autre.

Une ligne sans destination (un ajustement administratif, un bonus) reste
affichée, simplement non cliquable : mieux vaut une ligne inerte qu'un lien
qui mène à une page vide.

---

## 23. Publier sur les stores ne fige pas l'application

**Question du client** : une fois l'application sur l'App Store et Google
Play, pourra-t-on encore la modifier comme ici ?

**Choix retenu** — deux canaux, selon ce qui change.

**Le contenu web** (écrans, textes, règles, correctifs, nouveaux écrans) part
en **mise à jour à chaud** via Capgo : l'application télécharge la nouvelle
version au lancement suivant, sans passer par une revue. Apple et Google
l'autorisent explicitement tant que l'application ne change pas de nature
(App Store Review Guidelines 3.3.2). Le serveur, lui, se met à jour comme
n'importe quel service web — immédiatement, pour tout le monde.

**Le natif** (nouveau plugin Capacitor, icône, permissions, version minimale
d'OS, numéro de version affiché sur la fiche) passe **toujours par les
stores**, avec les délais de revue habituels.

**Le garde-fou est obligatoire.** Une mise à jour à chaud qui plante au
démarrage rendrait l'application inutilisable sans recours. L'interface
appelle donc `confirmAppReady()` une fois montée ; sans ce signal dans les
dix secondes, le plugin restaure automatiquement la version précédente.
`directUpdate: false` complète la précaution : la nouvelle version s'applique
au démarrage suivant, jamais en pleine session.
