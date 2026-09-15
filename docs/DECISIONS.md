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

**Choix retenu** — **deux options à l'écran seulement : points UNO et
« Payer en ligne »**. **Apple Pay et Google Pay ne sont pas des moyens de
paiement distincts** : ce sont des porte-cartes. Stripe les propose
automatiquement dès lors que l'appareil en dispose et que le domaine est
vérifié. Les ajouter comme boutons séparés aurait produit un écran plus long
et deux boutons morts sur les appareils qui ne les gèrent pas.

**Le même raisonnement vaut pour la carte et Bancontact**, et c'est un
revirement assumé : l'écran en faisait d'abord deux choix distincts, et le
serveur déclarait à Stripe lequel autoriser (`payment_method_types`). Deux
défauts, l'un pour le joueur et l'autre pour la ligue :

- le joueur devait trancher **avant** de voir les moyens réellement
  disponibles ; choisir « Carte » lui interdisait Bancontact sur la page
  suivante, et inversement, alors qu'une seule page Stripe sait les proposer
  tous les deux ;
- la liste vivait **dans le code**. Ajouter un moyen — iDEAL pour un joueur
  néerlandais, un virement SEPA — demandait un déploiement, là où Stripe sait
  le faire depuis son tableau de bord.

Sans `payment_method_types`, Checkout compose lui-même la liste à partir du
pays de la carte, de l'appareil, de la devise et du montant, et classe les
moyens par taux de réussite. Les moyens acceptés se cochent désormais dans
*Paramètres → Moyens de paiement* du tableau de bord Stripe.

**Les deux anciens moyens restent lisibles, jamais sélectionnables.** Les
lignes déjà écrites portent `stripe_card` ou `stripe_bancontact` ; elles
gardent un libellé dans l'historique du portefeuille, mais l'API refuse ces
valeurs en entrée (`LEGACY_PAYMENT_METHODS` dans
`packages/shared/src/constants.ts`).

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

---

## 24. La saisie des statistiques relève des actions, pas des compteurs

**Question du client** : la saisie des statistiques ne tenait pas le rythme
d'un visionnage. Il fallait pouvoir relever un match en le regardant, et
changer les joueurs d'une séance à l'autre sans repasser par une réservation.

**Choix retenu** — une **feuille de saisie** autonome, événementielle, publiée
ensuite vers le classement.

**Des actions, pas des compteurs.** Une action est un fait daté — « à 4:12,
untel marque, servi par un tel ». Le score, les passes, les buts encaissés et
les points en sont déduits. Trois propriétés en découlent, qu'un tableau de
compteurs ne peut pas offrir : annuler est trivial (on retire le fait, les
totaux suivent), le score ne peut pas contredire les buteurs puisqu'il en est
la somme, et chaque chiffre est justifiable — derrière un total, il y a un
timecode qu'on peut revoir.

**Le gardien n'est pas saisi deux fois.** On indique qui entre au but ; les
buts encaissés s'attribuent alors tout seuls, puisque le domaine sait qui
gardait la cage adverse à l'instant du but. C'est la statistique la plus
facile à oublier, et la seule qu'il aurait fallu saisir *pour l'équipe d'en
face*.

**Une feuille vit à côté de la réservation, pas dedans.** Une réservation naît
d'un besoin commercial — des places, des paiements, un quota ; une feuille
naît d'un besoin de relevé. Les confondre imposait le parcours de réservation
complet pour saisir dix minutes de jeu. La feuille peut néanmoins se rattacher
à une session réservée, et en reprend alors le lieu, la date, la division et
les inscrits.

**La publication n'est pas un second calcul.** Elle convertit la feuille en
session, puis emprunte `applyRecordSession` — le code qui sert déjà à la
console d'administration. Deux chemins de saisie qui recalculeraient chacun
l'XP, les distinctions et les divisions finiraient par donner deux
classements ; il n'y en a qu'un.

**Les récompenses en UNO sont décochées par défaut.** Une feuille saisie en
visionnage relève souvent une séance encaissée hors de l'application, ou
rattrape un historique. Créditer de la monnaie interne dans ces cas serait un
cadeau involontaire, et un crédit ne se reprend pas. L'option existe, elle se
coche sciemment (`awardUno`), et elle ne commande que la monnaie : les
statistiques, l'XP, les distinctions et les mouvements de division
s'appliquent toujours.

**La saisie n'attend jamais le réseau.** Les actions sont écrites localement
puis poussées par lots, avec une clé d'idempotence produite par l'appareil et
unique en base. Une coupure, un onglet rouvert ou un lot rejoué n'écrivent
jamais deux fois — et une salle sans couverture n'empêche pas de saisir.

---

## 25. La division réelle prime sur celle du jour de l'inscription

**Le client signale** des réservations UNO League contenant des joueurs de
trois divisions, et en donne lui-même la cause : un joueur inscrit à plusieurs
sessions est promu après l'une d'elles, et reste dans les autres.

**Ce n'était pas un cas limite mais le cas courant.** La division était
vérifiée à l'inscription et plus jamais ensuite ; or une clôture de session
fait monter cinq joueurs et en fait descendre cinq (RANK-005). Un joueur
inscrit au mercredi et au vendredi change de division dès la saisie du
mercredi. Sur cinq sessions de démonstration, six réservations à venir
mélangeaient déjà trois divisions.

**Choix retenu :**

 - **la division réelle est la seule qui compte.** Une place devenue
   inéligible est retirée, quel que soit l'état de la session : proposition,
   réservation, ou session confirmée avec équipes tirées. Faire une exception
   pour les sessions confirmées aurait rendu la règle inapplicable là où elle
   se viole le plus souvent — la promotion tombe la veille du match suivant ;
 - **un remplaçant de la bonne division reprend la place** s'il y en a un dans
   la file. Il hérite du poste dans l'équipe : le tirage survit, seul le nom
   change. Sinon la place est libérée, le tirage effacé, et la session
   redescend de « session » à « réservation » puis à « proposition » — les
   inscriptions rouvrent, aux joueurs de la bonne division ;
 - **le statut se déduit des inscrits, il ne se décide pas.** C'est la règle
   de l'inscription (CAL-007) et du paiement (CAL-011) lue à l'envers : une
   session qui perd un joueur redescend d'elle-même. Écrire un statut à la
   main aurait créé une troisième vérité ;
 - **la place réglée est remboursée en UNO**, y compris si elle avait été
   payée en euros — le joueur n'a pas choisi de partir, il ne doit pas
   attendre un remboursement bancaire. Le crédit porte une clé d'idempotence
   fondée sur le paiement : un balayage rejoué ne verse rien de plus ;
 - **une session déjà jouée n'est jamais retouchée**, et la session dont la
   clôture provoque le balayage s'exclut elle-même. Ce qui s'est passé sur le
   terrain s'est passé ; ses matchs sont validés et ses statistiques
   reportées.

**Trois portes mènent au même traitement** : la clôture d'une session, le
changement de division par l'administration, et la montée/descente de fin de
saison. Chacune appelle la même fonction dans **sa propre transaction** :
laisser la promotion et le retrait se séparer ouvrirait une fenêtre pendant
laquelle un joueur est en D1 et toujours inscrit en D2.

**Un balayage d'entretien complète le dispositif**, sans le remplacer. Il
rattrape ce qu'aucun évènement n'a corrigé : une division modifiée directement
en base, ou des inscriptions antérieures à cette règle. Il traite chaque place
dans sa propre transaction, pour qu'un échec sur une session n'empêche pas de
corriger les autres.

**Le rôle d'arbitre relève de la même règle.** `joinProposal` ne vérifiait pas
le type de compte : un arbitre pouvait prendre une place de joueur en appelant
l'API directement, le bouton masqué dans l'interface ne protégeant rien
(P-003). Le contrôle est désormais côté serveur, à l'inscription comme dans la
file d'attente, et une place déjà prise est rendue.

**Le jeu de démonstration produisait le défaut lui-même.** Il composait ses
effectifs d'après la division d'origine des joueurs, jamais relue entre deux
sessions. Il relit désormais les divisions en base avant chaque session — et
comme chaque clôture en déplace dix, l'effectif est passé à vingt-quatre
joueurs par division : à seize, une division tombait sous le seuil de quinze
dès la deuxième session du calendrier.

---

## 26. Superviseurs : ouvrir la saisie sans ouvrir la porte

**Le client demande** que des « superviseurs » — joueurs ou arbitres qu'il
choisit et valide lui-même — puissent saisir les statistiques de session comme
lui, classement et points se mettant à jour automatiquement.

**Choix retenu :**

 - **le droit s'ajoute au compte, il ne le remplace pas.** Une colonne
   `players.is_supervisor`, et non un troisième type de compte : un superviseur
   reste joueur avec sa division et son classement, ou arbitre avec ses
   sessions dirigées. En faire un rôle exclusif aurait obligé à choisir entre
   jouer et superviser ;
 - **une seule saisie existe.** Les routes de saisie ont quitté le routeur
   d'administration pour un routeur `supervision` que l'administration appelle
   aussi. Dupliquer l'implémentation aurait fait deux vérités : celle de
   l'admin et celle du superviseur, divergentes au premier correctif ;
 - **un superviseur ne saisit jamais une session qu'il a jouée ou arbitrée.**
   Il y déciderait de sa propre montée en division, de son homme du match et de
   ses propres UNO. Ce n'est pas une question de confiance : c'est une position
   où l'on ne met personne, et une suspicion qu'on n'inflige pas au reste de la
   ligue. La règle s'applique **deux fois** — la session n'apparaît pas dans sa
   file, et la demander directement est refusée — parce qu'une règle qui ne se
   découvre qu'au moment du refus est une règle mal posée ;
 - **l'administration en est dispensée.** C'est elle qui tranche les litiges,
   et une ligue dont l'organisateur joue serait bloquée par la règle inverse ;
 - **le droit est relu en base à chaque requête**, comme le rôle. Un droit
   retiré ferme la porte à l'appel suivant, sans attendre l'expiration d'une
   session.

**Un piège évité de justesse.** « L'administration supervise par nature » avait
d'abord été *dérivé* au moment de lire la session : `resolveSession` posait le
drapeau pour un administrateur. Toute identité construite autrement — et le
harnais de test en construit — perdait alors le droit. La règle porte
désormais un nom, `maySupervise`, et c'est elle qu'on interroge partout ; le
drapeau, lui, ne dit plus que ce que contient la colonne.

---

## 27. Les vidéos sont des liens, pas des fichiers

**Le client demande** de pouvoir téléverser une ou plusieurs vidéos au moment
de la saisie, une séance de deux heures en comptant souvent deux.

**Choix retenu** — l'application stocke **l'adresse**, jamais le fichier. Deux
heures de futsal filmées au téléphone pèsent un à cinq gigaoctets : les faire
transiter par l'API demanderait un stockage objet facturé au volume, un envoi
de dix à quarante minutes en 4G, et une reprise sur coupure. La vidéo reste là
où elle a été déposée — YouTube en non répertorié, Vimeo, un partage de
fichiers — et l'application n'en garde que le lien. C'est immédiat, gratuit, et
la limite de six vidéos par session tient au bon sens, pas à la place disque.

**Une adresse fournie par un humain ne devient jamais un cadre intégré sans
contrôle.** Un `<iframe>` exécute la page distante à l'intérieur de
l'application : ouvert à n'importe quel domaine, il laisserait un superviseur y
afficher ce qu'il veut, jusqu'à une fausse page de connexion. Deux hébergeurs
seulement sont jouables, et **l'identifiant de la vidéo est extrait puis
réécrit dans une adresse que nous construisons** — le lien d'origine n'est
jamais recopié dans un `src`. Tout le reste est un lien ordinaire, ouvert dans
le navigateur avec `rel="noopener noreferrer"`.

Le schéma est vérifié aussi : ni `javascript:`, ni `data:` ne franchissent
cette porte. Et l'adresse jouable est **recalculée à la lecture** plutôt que
stockée : la règle d'intégration peut être resserrée demain sans qu'aucune
ligne écrite hier ne redevienne exécutable.

**Qui les voit** — les joueurs de la session, son arbitre, les superviseurs et
l'administration. Personne d'autre : être filmé au futsal du mardi n'est pas
consentir à une diffusion à toute la ligue.

---

## 28. Un écran dont on ne peut pas sortir n'est pas un écran

**Le client signale** qu'il se retrouve bloqué dans la feuille de saisie, sans
moyen de revenir en arrière.

**Trois défauts se cumulaient**, et aucun n'était visible en développement :

 1. la flèche de l'en-tête appelait `navigate(-1)` **à l'aveugle**. Ce n'est
    pas l'historique de l'application qu'elle remonte, mais celui du
    navigateur : sur un écran ouvert directement — lien partagé, page
    rafraîchie, notification, retour depuis le tunnel de paiement — il n'y a
    aucune entrée précédente, et le bouton renvoyait sur la page vide de
    l'onglet. Mesuré : `about:blank` ;
 2. la console d'administration **masquait la barre d'onglets**, seule sortie
    de secours de l'application ;
 3. le bouton « Retour » de la feuille se trouvait tout en haut d'un
    formulaire de plus de deux mille pixels.

**Choix retenu** — la flèche ne quitte plus jamais l'application : sans entrée
précédente, elle navigue vers une destination de repli propre à chaque écran
(`backTo`). La console garde sa barre d'onglets. Et la feuille de saisie porte
une sortie à son pied, à côté du bouton d'enregistrement, là où l'on est quand
on renonce.

React Router marque la première entrée d'une session de navigation d'une clé
`default` : c'est ce signal, et non un compteur d'historique, qui dit qu'il n'y
a rien derrière.

---

## 29. Deux saisies, un seul droit

La saisie en visionnage (§24) et le rôle de superviseur (§26) ont été
construits séparément, sur deux branches qui s'ignoraient. Les réunir posait
une question qu'aucune des deux ne pouvait trancher seule : **qui a le droit
de relever des statistiques en regardant la vidéo ?**

**Choix retenu** — le même droit que pour la saisie au tableau. C'est
littéralement ce qu'un superviseur est nommé pour faire ; lui donner l'un sans
l'autre aurait été une distinction sans raison. `tracker.router.ts` passe donc
d'`adminProcedure` à `supervisorProcedure`, et l'écran quitte le préfixe
`/admin` pour `/visionnage` : une adresse qui annonce « admin » à quelqu'un
qui n'est pas administrateur ment sur ce qu'il est.

**Le contrôle du conflit d'intérêt se déplace, lui.** Pour une session
réservée, il porte sur la session ; pour une feuille de visionnage, il ne peut
pas : une feuille n'est pas rattachée à une réservation, et sa publication
peut créer la session — il n'y aurait alors aucun participant à interroger. Le
contrôle porte donc sur **la feuille**, et **au moment de publier** : relever
des actions ne décide de rien, publier décide des distinctions, des UNO et des
divisions. Un superviseur qui figure sur la feuille ne peut pas la publier.

**Les deux dispositifs vidéo se complètent** plutôt qu'ils ne se doublent. Le
lecteur de visionnage sert à **saisir** : il ouvre le fichier depuis le disque,
ralentit, revient en arrière, et rien ne quitte l'appareil. Les liens de
session (§27) servent à **revoir** : les joueurs retrouvent l'enregistrement
sur la page de leur séance. L'un est un outil de travail, l'autre une archive.

---

## 30. Une séance a des enregistrements, pas un enregistrement

La feuille de saisie ne portait qu'une adresse, `stat_sessions.video_url`. Or
deux heures de futsal se filment rarement d'une traite : deux fichiers, parfois
une prise par mi-temps.

**Choix retenu** — une table `stat_session_videos`, et l'adresse **facultative**.
C'est ce dernier point qui compte : un fichier ouvert depuis le disque n'a pas
d'adresse, et n'en aura jamais puisqu'il ne monte pas sur le serveur. L'entrée
sert alors de **repère nommé** — « 1re heure » — que l'on ré-associe à son
fichier à chaque visite. Le repère, lui, survit.

**Et c'est le repère qui rend une position relisible.** `video_start_ms` disait
où commence un match dans « l'enregistrement » ; avec deux fichiers, la phrase
n'a plus de sens. `stat_matches.video_id` accompagne donc la position :
rouvrir une action de la seconde heure ne va plus la chercher dans la
première.

Un fichier ouvert pendant la visite est retenu par enregistrement, de sorte
qu'un aller-retour entre les deux heures ne le redemande pas. Il n'est pas
mémorisé au-delà : il n'y a rien à mémoriser.

---

## 31. Ce qu'on regarde après coup n'est pas ce qu'on remplit avant

Trois corrections d'un même malentendu : l'écran d'une session montrait tout
ce qu'on sait d'elle, sans se demander à quel moment cela intéresse quelqu'un.

**Les barres d'inscriptions et de paiements disparaissent une fois la session
jouée.** « 15/15 » ne renseigne personne sur une séance qui a eu lieu — elle a
forcément été complète et payée, c'est ce qui l'a rendue possible — et cela
occupe la place de ce qu'on est venu voir : le résultat.

**Une seule vidéo à l'écran, pas la pile.** Une séance en compte deux ou trois ;
les empiler faisait défiler un mur de lecteurs avant le classement. On montre
la première, et les autres se choisissent d'un geste quand il y en a plusieurs.

**Et rien du tout quand il n'y en a aucune.** Un titre de section suivi du vide
est une promesse non tenue.

---

## 32. La vidéo qui a servi à compter est celle qu'on montre

**Le client signale** que l'historique d'une session affiche bien un cadre
vidéo, mais **pas la bonne vidéo** : celle qui a servi à relever les
statistiques n'y arrive jamais. Il ajoute qu'il ne compte pas utiliser
YouTube ni Vimeo, du moins pour l'instant.

Les deux dispositifs (§29) se complétaient, mais ne se parlaient pas : les
enregistrements attachés à une feuille de visionnage restaient dans
`stat_session_videos`, et la page de session lisait `session_videos`. Deux
tables, deux saisies, aucun pont.

**Choix retenu** — la publication d'une feuille **recopie** ses
enregistrements sur la session publiée. Recopie, et non partage d'une même
ligne : une feuille de visionnage peut exister sans session, et la session,
une fois publiée, doit garder ses vidéos même si la feuille est retouchée ou
supprimée. La copie est dédoublonnée par adresse — republier n'empile pas.

**Les repères sans adresse ne franchissent pas le pont.** Un fichier ouvert
depuis le disque n'a pas d'adresse (§30) : son entrée n'est un repère que pour
celui qui saisit, et n'aurait rien à montrer à un joueur.

**Une adresse directe se joue sur place, désormais.** L'intégration se limitait
à YouTube et Vimeo, tout le reste devenant un lien à ouvrir ailleurs. C'était
prendre le cas rare pour le cas courant : ici l'enregistrement est un
**fichier** déposé quelque part, pas la page d'un lecteur tiers. Un élément
`<video>` le lit directement, et — contrairement à un cadre — **n'exécute
rien** : il décode un flux ou échoue. L'argument qui interdit `<iframe>` hors
allowlist (§27) ne s'applique donc pas à lui, et n'importe quelle adresse
http(s) peut y servir de source sans ouvrir de porte. Si le navigateur n'en
tire rien — format inconnu, fichier déplacé, hôte qui refuse la lecture
directe — on retombe sur le lien plutôt que sur un rectangle noir.

**Symétriquement, l'outil de saisie refuse YouTube et Vimeo.** Il relève des
positions au millième et fait revenir la vidéo en arrière ; un cadre YouTube
est une page, pas un fichier, dont on ne peut ni lire ni fixer la position
sans embarquer le lecteur du site. Mieux vaut le dire à l'ajout que laisser
découvrir un lecteur qui ne répond pas.

**Et le jeu d'essai ne fabrique plus de fausses vidéos.** Il attachait des
liens YouTube d'illustration à quelques sessions ; c'étaient elles, la
« mauvaise vidéo » vue à l'écran.

---

## 33. Une note qui ne peut que monter ne dit plus rien

**Le client demande** que la note globale de la carte « évolue à la hausse ou
à la baisse selon les performances : plus de points qu'à la session
précédente, elle augmente ; moins, elle diminue ».

**Le défaut était structurel.** La note était *dérivée* du total de carrière —
une somme, donc une fonction croissante. Un joueur pouvait enchaîner dix
séances catastrophiques, sa note montait quand même, un peu moins vite.
Aucun réglage de la formule n'y changeait rien : le problème n'était pas le
barème, c'était le fait de dériver d'un cumul.

**Choix retenu** — la note devient une valeur **stockée**, déplacée à la
clôture de chaque session classée. Elle mesure la forme, non plus le palmarès.

Le déplacement suit exactement la règle demandée, avec deux réglages :

 - **le sens** est celui de la comparaison, sans seuil. Un demi-point de mieux
   qu'à la séance précédente fait monter la note d'un point — la règle est
   « plus ou moins », pas « beaucoup plus ou beaucoup moins » ;
 - **l'amplitude** suit l'écart, par crans de trois points de barème, plafonnée
   à trois points de note par session. Sans plafond, un match exceptionnel
   ferait basculer une carte de dix points et la note deviendrait une loterie.

**Une première session ne déplace rien** : il n'y a rien à quoi la comparer.
Elle sert de référence à la suivante.

**Stocker n'est pas renoncer à vérifier.** Chaque déplacement laisse la note
d'avant et d'après sur `proposal_participants` : la valeur courante se relit
comme la somme d'une histoire, l'historique de session affiche le mouvement,
et une correction sait exactement quel écart défaire. À la migration, les
cartes existantes sont initialisées avec l'ancienne formule — personne ne
retombe à 50 du jour au lendemain.

**Une conséquence à assumer.** Un joueur peut voir sa note monter tout en
descendant de division : il a fait mieux que la fois d'avant, mais reste dans
les cinq derniers de cette session-là. Les deux indicateurs ne mesurent pas la
même chose — l'un compare le joueur à lui-même, l'autre aux quatorze autres —
et c'est précisément ce qui les rend complémentaires à l'écran.

---

## 34. Corriger une saisie, c'est la défaire avant de la refaire

**Le client demande** de pouvoir modifier les statistiques d'une session déjà
attribuée, « dans le cas de corrections à faire ».

**Pourquoi on ne peut pas écrire par-dessus.** Une clôture ne range pas des
chiffres dans une case : elle *distribue*. Statistiques de carrière, XP,
niveau, compteur d'homme du match, distinctions, récompenses UNO, montées et
descentes de division, note de carte. Modifier la feuille sans toucher au
reste laisserait un joueur avec les buts corrigés et la promotion de l'ancien
classement.

**Choix retenu** — une **réouverture**, puis la saisie ordinaire. Le serveur
défait ce que la clôture avait fait, la session repasse en « confirmée » et
réapparaît dans la file de saisie, où on la corrige exactement comme une
première fois.

C'est ce qui a fait préférer la réouverture à un second chemin d'écriture :
la clôture reste le **seul** endroit qui décide. Deux chemins auraient fini
par diverger, et le second — exercé une fois sur cent — aurait divergé sans
que personne s'en aperçoive.

**Deux effets ne se défont pas, et c'est dit avant de confirmer :**

 - **les UNO déjà versés restent acquis.** Reprendre une récompense dépensée
   en boutique creuserait un solde négatif, et une ligue amateur ne redemande
   pas un prix remis. Les clés d'idempotence font qu'une re-clôture ne verse
   rien deux fois ; seul un nouveau bénéficiaire, s'il y en a un, est crédité ;
 - **les places retirées d'autres sessions ne reviennent pas.** Une montée de
   division a pu vider une réservation à venir (CAL-002), rembourser le joueur
   et la faire reprendre par un remplaçant. Remonter ce fil déferait le choix
   d'un tiers.

**Divisions et notes se défont par l'écart, pas par la valeur d'avant.** Le
joueur a pu rejouer depuis ; lui réimposer son ancienne division effacerait
les sessions suivantes. Reculer d'un cran compose correctement quoi qu'il se
soit passé entre-temps.

**Le droit est celui de la saisie**, garde-fou compris : un superviseur qui a
joué ou arbitré cette session ne la rouvre pas davantage qu'il ne la saisit.
Rouvrir défait des distinctions et des montées de division — c'est la dernière
personne à qui le confier.

---

## 35. L'arbitre n'a pas de division

**Le client signale** qu'un arbitre affiche « D3 » sur son profil, et demande
de vérifier qu'il n'entre pas au classement. Il n'y entrait pas : il y entrait
bel et bien.

**La cause** — la colonne `division` n'est pas nullable et vaut `D3` par
défaut. Un arbitre en portait donc une, sans que rien ne la lui ait donnée.
Trois conséquences, de la plus visible à la plus grave :

 1. son profil et sa carte annonçaient une division qu'il n'a pas ;
 2. il figurait au classement D3, dernier, à zéro point ;
 3. **la relégation de fin de saison prend les derniers d'une division** : il
    serait descendu d'une division qu'il n'avait jamais eue — et une promotion
    l'aurait fait monter dans une division où il ne joue pas.

**Choix retenu** — la division est retirée **à la source**, dans la projection
publique : `division` vaut `null` pour un arbitre, et le type le dit. Le
compilateur a alors désigné lui-même les quinze écrans qui supposaient une
division, plutôt que de les laisser afficher « D3 » ou « Division · ».

Côté requêtes, la condition « seuls les joueurs sont classés » porte un nom,
`isRankedPlayer`, parce qu'elle vaut pour **toutes** les requêtes de
classement : l'oublier dans une seule suffisait à faire réapparaître le
défaut. Et l'administration ne peut plus changer la division d'un arbitre —
la route la refuse, pas seulement l'écran.

---

## 36. Une note de 55 pour le meilleur joueur de D1

**Le client constate** que le mécanisme de note fonctionne — elle monte, elle
descend — mais que l'échelle est fausse : « même les meilleurs joueurs de D1
n'ont que 55, alors qu'un joueur de D3 a entre 50 et 55 ». Il donne la cible :
un bon D1 vers 80, un bon D2 vers 70, un bon D3 vers 60.

**Le défaut était d'avoir gardé un seul point de départ.** Toutes les cartes
partaient de 50 et se déplaçaient d'un à trois points par séance. La note
disait donc la *forme récente*, et seulement elle : après vingt séances, le
meilleur joueur de la ligue et un débutant en réussite se retrouvaient à
quelques points l'un de l'autre. Deux informations distinctes — le niveau et
la forme — s'écrasaient l'une l'autre.

**Choix retenu** — la division fixe le **socle**, la forme fait bouger la note
**à l'intérieur** de sa bande :

```
D3 : 50 → 72      D2 : 62 → 84      D1 : 74 → 99
```

Les règles de déplacement (§33) ne changent pas d'un iota : c'est bien le
point de départ qui manquait, pas la mécanique.

**Les bandes se chevauchent, et c'est voulu.** Un D3 en pleine réussite (70)
dépasse un D2 en difficulté (63). Le classement dit qui est le meilleur de sa
division ; la note dit ce que vaut le joueur. Un recouvrement d'une dizaine de
points laisse les deux coexister sans qu'une montée de division devienne une
simple formalité arithmétique.

**Une montée replace la note au plancher de la nouvelle division** — passer de
68 à 74 en montant en D1 est la récompense visible de la promotion. Une
descente, elle, n'écrase rien : la note n'est ramenée que si elle dépassait le
plafond d'arrivée, faute de quoi un joueur relégué perdrait d'un coup ce que
vingt séances avaient construit.

**Mesuré sur le jeu d'essai** après recalibrage — D1 : 74 à 89, moyenne 81.
D2 : 62 à 84, moyenne 69. D3 : 52 à 72, moyenne 59. C'est la cible demandée.

**Un défaut de seconde main, trouvé en vérifiant.** Le jeu d'essai calculait le
niveau avec la formule en dur `xp / 500 + 1`, recopiée au lieu d'être appelée.
Elle avait survécu au changement de barème. Le seed passe désormais par les
fonctions partagées, comme le reste.

---

## 37. Des niveaux qui se méritent, et qui rapportent

**Le client demande** trois choses : que chaque niveau verse des UNO (10 au
niveau 2, 20 au niveau 3, 30 au niveau 4…), que l'XP vienne aussi des
distinctions et pas seulement des matchs, et que la progression ne soit « pas
trop favorable à long terme » — plus le niveau monte, plus il doit coûter.

**Ce qui n'allait pas.** Chaque palier coûtait 500 XP, quel qu'il soit. La
progression était linéaire : un joueur régulier accumulait des niveaux
indéfiniment au même rythme, et un niveau élevé ne disait plus rien d'autre
que « il est là depuis longtemps ».

**Choix retenu** — un palier coûte `300 + 100 × (niveau − 1)` : 300 XP pour le
niveau 2, 400 pour le 3, 500 pour le 4. Les premiers viennent vite — c'est ce
qui donne envie de continuer — et les suivants se méritent.

**Le calibrage vient de la ligue, pas d'un nombre rond.** Une séance rapporte
50 XP de participation plus ses actions ; un joueur correct en tire 120 à 180.
À raison d'une séance par semaine :

| Niveau | XP cumulée | Séances | Durée |
|---:|---:|---:|---|
| 2 | 300 | 2 | deux semaines |
| 5 | 1 800 | 12 | trois mois |
| 10 | 6 300 | 42 | une saison |
| 15 | 13 300 | 89 | deux ans |
| 20 | 22 800 | 152 | trois ans et demi |

**Les distinctions rapportent de l'XP** (60 pour le meilleur buteur, 50 pour le
meilleur passeur et le meilleur défenseur, 25 pour la meilleure équipe, 100
pour l'homme du match). Une distinction dit quelque chose que la somme des
actions ne dit pas : avoir été le meilleur de sa séance. Elle est versée même
quand la clôture ne distribue pas d'UNO — l'XP mesure le parcours, pas la
caisse.

**Un seul chemin ajoute de l'XP**, `awardXp`, parce que trois choses doivent
aller ensemble : l'XP, le niveau qu'on en déduit, et les UNO du palier
franchi. Les disperser garantissait qu'un chemin oublierait la récompense ou
la verserait deux fois.

**Chaque palier est payé une fois, définitivement.** La clé d'idempotence porte
le joueur et le niveau : redescendre puis remonter au niveau 7 — ce qui arrive
après la correction d'une session (§34) — ne le repaie pas.

**Le coût à connaître.** Atteindre le niveau 10 verse 450 UNO cumulés (45 €),
le niveau 20 en verse 1 900 (190 €). Sur trois ans et demi, cela représente
environ 55 € par an et par joueur assidu — près de trois séances offertes.
C'est le barème demandé ; il se règle d'une constante
(`UNO_PER_LEVEL_STEP`) si la ligue le juge trop généreux.

**Un effet de bord assumé** : la courbe n'étant plus la même, les niveaux
existants se recalculent à la migration, et certains joueurs en perdent un ou
deux. L'XP acquise, elle, n'est pas touchée — c'est la lecture qui change, pas
l'histoire.

---

## 38. Ce qu'un joueur ne peut plus changer lui-même

**Le client demande** que l'adresse e-mail apparaisse dans « modifier mon
profil », que la date de naissance n'y soit plus modifiable, et que seuls les
majeurs puissent s'inscrire. Il ajoute que l'administration doit pouvoir
corriger n'importe quel champ, « au cas où ».

**Les trois demandes n'en font qu'une.** Ce qui identifie un compte — l'adresse
par laquelle on s'y connecte, la date de naissance qui porte la majorité
vérifiée à l'inscription — ne peut pas rester librement modifiable : ce serait
laisser réécrire après coup ce qui a été contrôlé avant. Les deux champs
s'affichent donc, grisés. Les montrer vaut mieux que les cacher : le joueur
doit pouvoir relire l'adresse avec laquelle il se connecte.

**L'âge se calcule sur les chaînes `AAAA-MM-JJ`, pas sur des `Date`.** Une date
de naissance est un jour civil, pas un instant ; la convertir en `Date` la
ferait basculer d'un jour selon le fuseau de l'appareil, et un joueur né un
1er janvier deviendrait majeur un jour trop tôt à Bruxelles. Le sélecteur de
l'écran d'inscription borne la saisie, mais c'est le serveur qui décide.

**Et c'est pourquoi `admin.updatePlayer` existe.** Une faute de frappe à
l'inscription arrive ; sans route de correction, la seule issue serait un
second compte — exactement ce que le verrouillage cherche à éviter. La
majorité reste exigée là aussi : corriger une coquille ne doit pas ouvrir la
porte à un compte mineur.

Division, type de compte et droit de supervision gardent leurs routes propres :
chacun déclenche des effets de bord — retrait de places, remise à zéro d'un
droit — qu'un patch générique masquerait.

---

## 39. Le superviseur visionne, l'administration tranche

**Le client resserre** le rôle : « Les superviseurs ne doivent avoir accès qu'à
*Saisie en visionnage*. Ils ne peuvent pas modifier des sessions existantes,
seul moi l'admin peut. »

**La règle se défend d'elle-même.** Les deux gestes n'engagent pas la même
chose. Relever des actions en regardant un enregistrement produit une
*feuille* — une proposition de résultat, que la publication soumet à ses
propres contrôles. Retoucher une session déjà en base réécrit *directement* le
classement, les récompenses et les divisions, sans filet.

**Choix retenu** — les routes qui touchent une session existante passent en
`adminProcedure` ; `tracker.router.ts` reste en `supervisorProcedure`. L'écran
de supervision ne montre plus que la saisie en visionnage.

**Une garde est morte, et il fallait la retirer.** `assertMaySupervise`
vérifiait qu'un superviseur n'avait pas joué la session qu'il saisissait.
L'administration en a toujours été dispensée — c'est elle qui tranche les
litiges. Une fois les routes réservées aux administrateurs, ce contrôle ne
pouvait donc plus se déclencher : le laisser en place aurait fait croire à une
garantie qui n'existe plus. Il vit là où il mord encore : à la publication
d'une feuille de visionnage, seul geste par lequel un superviseur décide
encore de distinctions, d'UNO et de divisions.

---

## 40. Une colonne générée naît avec sa table, ou n'existe pas

**Le symptôme.** La migration du mode SQUAD a échoué deux fois sur la base du
client, la seconde fois sur une base **entièrement vidée** juste avant :

```
code: 'ER_UNSUPPORTED_ACTION_ON_GENERATED_COLUMN', errno: 3106,
sqlMessage: "'Adding generated stored column through ALTER TABLE'
             is not supported for generated columns."
```

**La première explication était fausse.** J'avais conclu à une migration à
moitié appliquée — le DDL étant validé instruction par instruction, une
interruption laisse bel et bien un état intermédiaire, et c'était la cause du
*premier* échec. Mais un `db:reset` suivi d'un `db:migrate` a reproduit le
second à l'identique : sur une base sans la moindre table, il ne restait aucun
état à incriminer. Ce n'était pas un accident de parcours, c'était une limite
du moteur.

**La vraie cause.** La base de production est TiDB, pas MySQL. TiDB accepte une
colonne générée **posée dans le `CREATE TABLE`**, et refuse la même colonne
**ajoutée ensuite par `ALTER TABLE`**. D'où l'asymétrie qui rendait le cas
déroutant : `squad_members.active_player_id` et les deux colonnes de
`squad_join_requests`, créées avec leur table en 0010, sont passées sans un
mot ; `squads.active_name` et `active_slug`, ajoutées en 0011, ont bloqué.

**Mon MySQL local n'est pas un environnement de test fidèle.** Il a accepté les
deux formes, et m'a donc laissé livrer deux fois une migration que la base
réelle refusait. C'est la leçon coûteuse de l'épisode : une garantie vérifiée
sur un moteur ne vaut pas pour un autre qui parle le même protocole.

**Choix retenu** — `squads.active_name` et `active_slug` deviennent des
colonnes **ordinaires**, tenues par `squads.service.ts` : posées à la création,
suivies au renommage, vidées à la dissolution. Les index uniques ne changent
pas : c'est toujours la base qui interdit deux clubs actifs du même nom, et
toujours `NULL` qui libère le nom d'un club dissous. Seul le *remplissage* de
la colonne passe du moteur au service.

**Ce qu'on perd, et comment on le compense.** Une colonne générée ne peut pas
dériver de sa source ; une colonne ordinaire, si — un chemin d'écriture oublié
suffirait. Trois tests tiennent désormais ce que le moteur tenait seul : la
réservation suit la fondation, le renommage et la dissolution ; un renommage
refusé ne laisse pas la réservation à moitié changée ; et un écrit direct en
base, contournant le service, se heurte encore à l'index unique.

**Deux migrations, et non une.** La 0011 est réécrite en colonnes ordinaires
pour toute base neuve. Une base qui avait déjà appliqué son ancienne version ne
la rejouera jamais — drizzle ne revient pas en arrière — et garderait des
colonnes générées, sur lesquelles le service ne peut plus écrire : la 0013
convertit ces bases-là, et ne fait rien sur les autres.

**La règle, désormais tenue par un test.** `migration.test.ts` refuse toute
migration qui ajoute une colonne générée par `ALTER TABLE`. Ce fichier existait
déjà — il garde la compatibilité TiDB depuis l'épisode `DEFAULT ('[]')` — et
ne connaissait simplement pas ce piège-ci. Il le connaît.

---

## 41. La place paie la salle, la mise ne paie rien

**Le client a tranché** le financement d'un match SQUAD : « Chaque joueur paie
sa place comme en league, mais la trésorerie du squad peut prendre en charge le
paiement d'un ou de plusieurs joueurs pour cette session si elle le souhaite,
sur décision du fondateur. Les prix d'application sont de 10€ pour une heure et
20€ pour 2 heures (par personne, et hors mises) ou équivalent UNO. »

**Deux flux d'argent, et tout l'enjeu est de ne jamais les mélanger.**

|  | La place | La mise |
|---|---|---|
| Qui paie | chaque joueur, ou la caisse pour lui | le club |
| Quand | à la composition | séquestrée à l'acceptation |
| Où va l'argent | à la salle — dépensé | au vainqueur — ou rendu sur un nul |
| Si le match n'a pas lieu | remboursé | rendu |

Les confondre reviendrait à croire qu'une équipe qui gagne joue gratuitement.
C'est pourquoi un défi réglé **ne rend pas les places** : la salle a été jouée.

**Le prix est figé à l'inscription.** Il est lu une fois, à la pose de la
place, et stocké sur la ligne. Le recalculer à chaque affichage ferait qu'un
changement de tarif modifierait rétroactivement ce qu'un joueur déjà inscrit
doit — et, pire, ce qu'un remboursement lui rend.

**La prise en charge est un pouvoir de fondateur, pas de capitaine.** Le
capitaine compose l'équipe ; engager l'argent des autres est autre chose. La
règle est celle que le client a formulée, et elle se défend : la caisse est
alimentée par les contributions de tous.

**Le remboursement revient d'où l'argent venait.** Retirer un joueur rend sa
place ; si le joueur avait payé, il est recrédité ; si la caisse l'avait pris
en charge, c'est la caisse. Rendre systématiquement au joueur ferait de chaque
remaniement de composition un cadeau aux dépens du club.

**Une place rendue ne condamne pas le joueur.** L'unicité ne porte que sur les
places **vivantes** — colonne générée, `NULL` une fois la place rendue, comme
partout ailleurs dans le modèle SQUAD. Un capitaine peut donc sortir un joueur
puis le réinscrire, ce qu'une unicité posée sur `(défi, joueur)` aurait
interdit pour le reste du défi.

**Annuler n'est pas régler.** Un défi accepté qui n'a pas lieu rend les mises
*et* rembourse les places : rien n'a été consommé. C'est réservé à
l'administration — un capitaine qui pourrait annuler seul aurait de quoi se
dérober dès que l'affiche tourne mal.

**Le règlement est pour l'instant une route d'administration.** En phase 5,
c'est le résultat du match qui appellera `applySettlement`. La route existe
d'ici là pour que le mouvement d'argent soit éprouvé *avant* que le match n'en
dépende, et non l'inverse.

---

## 42. Un défi accepté, c'est là qu'on a le plus à se dire

**Un défaut trouvé en vérifiant la phase 4 à l'écran**, et non par un test : le
fil de discussion d'un défi affichait « Ce fil est clos » alors que le défi
venait d'être **accepté**.

La cause tenait en une ligne. `isChallengeSettled(status)` — vrai dès que le
statut n'est plus `pending` — servait à deux questions différentes :

 - *peut-on encore marchander la mise ?* Non, dès l'acceptation. Correct ;
 - *les deux clubs peuvent-ils encore se parler ?* La même réponse, et elle
   était absurde.

Un défi accepté est précisément le moment où il y a le plus à organiser :
composer les équipes, régler les places, convenir de l'heure devant la salle.
Le fil se fermait à l'instant où il devenait utile. La phase 4 aggravait le
défaut, puisqu'elle installe toute la composition dans cet état-là.

**Choix retenu** — un prédicat par question. `isChallengeSettled` garde la
négociation ; `isChallengeChatOpen` ouvre le fil tant qu'il reste quelque chose
à organiser — `pending` ou `accepted` — et le ferme quand il n'y a plus rien :
refusé, retiré, expiré, ou joué.

**Ce que cet épisode dit de la méthode.** Les 288 tests passaient : aucun ne
demandait à écrire dans le fil d'un défi accepté, parce que cet état n'avait
jamais servi à rien avant la phase 4. Une règle juste sur un cas et fausse sur
l'autre passe sous les tests tant que le second cas n'existe pas. Regarder
l'écran reste le seul moyen d'attraper celle-là.

---

## 43. L'adresse du salon n'est pas connue d'avance

**Le besoin** : voir l'application sur un vrai téléphone, sans la déployer.
L'iPhone et le PC sont sur le même Wi-Fi, l'iPhone ouvre
`http://192.168.1.42:5173` — et tombe sur un écran blanc.

**La cause** n'est pas le serveur de développement, qui écoute bien, mais le
partage de ressources entre origines. Le navigateur annonce
`Origin: http://192.168.1.42:5173`, que `CORS_ORIGINS` ne contient pas. Or
cette adresse **ne peut pas y être inscrite d'avance** : c'est le routeur qui
la distribue, elle change de maison en maison et de bail en bail. L'écrire à
la main marche un jour et se périme en silence.

**Choix retenu** — hors production, une origine de réseau privé est acceptée
d'office : bouclage, plages RFC 1918, lien-local RFC 3927, et les noms en
`.local` du mDNS. `isPrivateNetworkOrigin` (`lib/network.ts`) reconnaît
l'adresse ; `index.ts` seul décide d'en tenir compte, et seulement hors
production, où la liste explicite reste seule autorité.

**Ce que le prédicat doit refuser compte plus que ce qu'il accepte.** La ruse
évidente est de faire commencer un domaine qu'on contrôle par une adresse
privée : `http://192.168.1.1.attaquant.com`. L'analyseur d'URL rend l'hôte
entier, pas son préfixe, et le compte de segments suffit à l'écarter — mais
c'est le genre de chose qu'on vérifie plutôt que de supposer, d'où six cas de
test dont quatre sont des refus.

**Une bonne surprise en l'écrivant** : l'analyseur d'URL ramène `2130706433`,
`0x7f.0.0.1` et `017700000001` à `127.0.0.1` avant qu'on ne regarde quoi que
ce soit. Ces écritures *désignent réellement* la machine locale ; les
accepter est juste, et c'est la normalisation — pas une liste noire — qui
interdit d'en faire une ruse.

**Et un refus n'est plus une panne.** Une origine rejetée sortait en 500
« Une erreur est survenue » : le navigateur affichait une panne de serveur là
où il s'agissait d'un réglage, et la cause ne se lisait que dans le journal.
Elle répond désormais 403 « Origine non autorisée ». Ce détail m'a coûté une
demi-heure de fausse piste en vérifiant la phase 4 — raison suffisante pour
le corriger.

---

## 44. Un match SQUAD est une session comme une autre

**Le client l'a dit en une phrase**, et elle a décidé de toute l'architecture :
« effectivement je rentrerai les résultats d'un match squad de la même façon
qu'un match amical ou uno league ».

**Choix retenu** — un match SQUAD est une `proposals` ordinaire, en mode
`squad`, avec ses deux équipes et sa rencontre. Il hérite donc gratuitement de
la feuille de match, de la saisie en visionnage, de l'historique de session, du
détail par joueur et de la correction. Aucune table nouvelle : la phase 5
n'ajoute pas une ligne de schéma.

Ce qui le distingue tient à deux endroits seulement : il **naît d'un défi**
plutôt que du calendrier, et sa clôture **règle la mise** en plus des joueurs.

### Le drapeau `ranked` commandait quatre choses à la fois

Le vrai obstacle n'était pas le match, c'était `ranked`. Un seul booléen
décidait des compteurs de carrière, des UNO de récompense, du mouvement de
division **et** de la note de carte. Tant qu'il n'existait que deux modes — la
League qui fait tout, l'amical qui ne fait rien — la confusion était invisible.

Le client a demandé la combinaison du milieu : « Statistiques et XP oui,
division et note non ». Elle n'était pas exprimable.

`GameMode.effects` dit désormais les quatre séparément. `ranked` survit, mais
avec son seul sens propre : le **statut** du mode dans la compétition — arbitre
désigné, division verrouillée, place au classement. Un mode peut ne pas être
classé et compter malgré tout les statistiques ; c'est exactement le SQUAD.

L'XP ne figure pas dans `effects` : elle est acquise dans tous les modes, parce
qu'elle mesure le temps passé à jouer.

**Pourquoi ni division ni note.** Un match SQUAD oppose deux clubs qui se sont
choisis. Y gagner ne dit rien du niveau qu'on aurait en D1, et laisser ces
rencontres déplacer les divisions permettrait à un club de faire monter les
siens en choisissant ses adversaires. **Pourquoi aucun UNO individuel** : la
mise est déjà la récompense, et elle va à la caisse. Les cumuler paierait deux
fois la même victoire.

### L'effectif se fige au coup d'envoi

Dès que le match existe, la composition ne bouge plus. La retoucher
reviendrait à réécrire qui a joué, et à rembourser la place d'un joueur qui est
sur le terrain. Le refus est dans le service, et l'écran cesse d'afficher les
boutons — dans cet ordre, jamais l'inverse.

Créer le match exige les dix places tenues **et** réglées : une feuille
incomplète donnerait un cinq contre quatre, une place impayée ferait jouer
quelqu'un aux frais des autres.

### Ce qu'on refuse d'essayer de défaire

Une session rouverte défait des statistiques, des divisions et des notes —
toutes portées par des colonnes qu'elle relit. Elle ne sait pas défaire un
**mouvement d'argent entre deux caisses** : la mise est partie chez le
vainqueur, qui a pu la dépenser depuis.

Rouvrir un match SQUAD déjà réglé est donc **refusé explicitement**, avec la
marche à suivre dans le message : annuler le défi — ce qui rend les mises et
rembourse les places — puis le rejouer. Un refus clair vaut mieux qu'une
correction qui laisse le score d'un côté et l'argent de l'autre.

---

## 45. Un ternaire ne se trompe pas tant qu'il n'y a que deux cas

**Trouvé en regardant l'écran, pas en lisant les tests.** Le premier match
SQUAD créé s'est affiché sous le titre **« Match amical »**, avec la mention
« ce mode n'a aucun effet sur les divisions : on y joue pour le plaisir ».

Deux écrans écrivaient la même chose :

```tsx
{proposal.modeId === "league" ? "UNO League" : "Match amical"}
```

Juste tant qu'il n'existe que deux modes ; faux à la seconde où un troisième
arrive, et faux **en silence** — aucun test ne casse, l'écran affiche
simplement un autre nom que le bon.

**Choix retenu** — `gameModeName(modeId)` lit le nom sur le mode lui-même. Le
texte des récompenses se déduit de `effects.careerStats` plutôt que d'être
écrit en dur : pour un match SQUAD il dit maintenant que les statistiques et
l'XP comptent, ce qui est vrai, là où il affirmait le contraire.

**La leçon est celle de la §42, et elle se répète** : les 307 tests passaient.
Un test vérifie ce qu'on a pensé à vérifier ; l'écran montre ce qu'on a écrit.
Pour une fonctionnalité neuve, il faut les deux.

---

## 46. Un transfert se conclut à trois

**La différence de fond avec un défi**, qui se conclut à deux : ici le club
vendeur cède, le club acheteur paie, et **le joueur accepte de partir**. Chacun
des trois peut dire non. Un club qui vendrait un joueur contre son gré en
ferait une marchandise ; un joueur qui partirait sans l'accord de son club
viderait la notion d'effectif de son sens.

### L'ordre des trois accords n'est pas indifférent

Le joueur tranche **en dernier**, et cela se défend :

 - lui demander son accord **d'abord** reviendrait à lui faire signer un chèque
   en blanc — il ignore encore l'indemnité, donc la prime qu'on lui offrira ;
 - le lui **redemander après chaque contre-offre** transformerait le dossier en
   va-et-vient sans fin entre trois boîtes de réception.

Il décide donc une seule fois, en connaissant les montants définitifs.

### Deux montants, deux destinataires, une seule sortie de caisse

L'indemnité va au club vendeur, la prime de signature au joueur. Les garder
séparés dans le modèle évite que le service ait à deviner la répartition ; les
additionner en un seul endroit — `transferTotalCost` — évite qu'un contrôle de
solde n'en oublie une moitié.

Les deux sont séquestrées **ensemble**, à l'acceptation du vendeur : l'offre
faite au joueur doit rester couverte pendant tout son délai de réflexion. Avant
cela, rien n'est bloqué — sans quoi une simple offre suffirait à geler la
caisse d'un rival.

### Ce que la base tient, et pourquoi ce n'est pas le code

`locked_player_id` vaut l'identifiant du joueur pendant la seule phase de
séquestre, et `NULL` partout ailleurs. L'index unique interdit donc que **deux
clubs immobilisent de l'argent en même temps pour le même joueur**, sans pour
autant empêcher plusieurs offres concurrentes tant qu'aucune n'est acceptée.

C'est exactement le bon niveau de contrainte : un marché où deux clubs ont le
droit de vouloir le même joueur, mais où un seul peut l'avoir sous séquestre.
Un contrôle applicatif ne suffirait pas — deux acceptations simultanées
passeraient toutes les deux.

### Quatre refus, et la raison de chacun

| Refus | Pourquoi |
|---|---|
| Un fondateur | Son club se retrouverait sans personne pour l'administrer. Qu'il transmette d'abord. |
| Un joueur en carence (7 jours) | Sinon il ferait le tour des clubs en une soirée, chaque vendeur encaissant au passage : de quoi fabriquer des UNO à partir de rien. |
| Un joueur inscrit sur un défi à venir | Sa place est tenue et réglée, l'effectif peut être figé : le laisser partir ferait jouer un club à quatre. |
| Une caisse insuffisante | Vérifié à l'offre **et** au séquestre. Le second fait autorité — la caisse a pu bouger — mais le premier donne l'erreur au moment du clic. |

### Qui peut quoi

Ouvrir une offre est réservé au **fondateur** : elle engage la caisse dès que
le vendeur l'accepte, et engager l'argent des autres n'est pas un pouvoir de
capitaine — c'est la règle déjà posée pour la prise en charge des places (§41).
Répondre côté vendeur est ouvert aux capitaines : cela rapporte, cela ne
dépense pas.

L'acheteur peut retirer son offre tant que le joueur ne l'a pas entre les
mains. Après, le retrait unilatéral reviendrait à faire miroiter une prime puis
à la reprendre au moment de signer.

### Une offre oubliée ne gèle pas une caisse

L'entretien périodique fait expirer les dossiers sans réponse et **rend ce qui
avait été engagé**. Sans cela, un club distrait immobiliserait sa propre
trésorerie indéfiniment.

### Le changement d'appartenance suit un ordre imposé

L'ancienne ligne se ferme **avant** que la nouvelle s'ouvre : l'index unique
sur `active_player_id` n'admet qu'une appartenance vivante, et l'ordre inverse
échouerait. La ligne fermée reste — c'est l'histoire du joueur, et les
compositions passées s'y adossent.

---

## 47. Une cote qui ne s'achète pas

**La spécification insiste, et elle a raison** : la cote d'un SQUAD est
indépendante des mises. Une équipe riche qui mise gros ne devient pas meilleure
pour autant.

Ce n'est pas une précaution théorique. Sans cette séparation, le classement
mesurerait deux choses à la fois — la force sportive et l'activité économique —
et un club fortuné pourrait **acheter sa place** en misant lourd sur des
rencontres qu'il gagne de peu. Force et fortune sont deux mesures ; les
mélanger n'en donne aucune.

Le barème est un Elo sans variante : l'écart de cote donne le résultat attendu,
et l'écart entre l'attendu et le réel déplace les deux cotes d'autant, en sens
contraire. Battre plus fort que soi rapporte beaucoup (+29 pour 400 points
d'écart), battre plus faible rapporte peu (+3), et perdre contre plus faible
coûte cher. La constante de 400 est celle d'origine : garder le repère des
échecs vaut mieux qu'un réglage arbitraire.

**Les deux cotes se calculent sur celles d'avant.** Mettre à jour un camp puis
calculer l'autre sur sa cote fraîche donnerait un résultat dépendant de l'ordre
des écritures, et ferait apparaître ou disparaître des points à chaque match.
Un test vérifie sur quatre paires de cotes et trois issues que la somme est
conservée.

**Le mouvement est stocké, pas seulement la valeur.** Les quatre colonnes
`*_rating_before/after` du défi permettent d'afficher « +16 » plutôt qu'un
nombre nu, et laissent un classement passé lisible même si le barème évolue —
la même raison qui avait fait stocker la note de carte (§33).

**Et un test le prouve en situation** : deux rencontres identiques sur le
terrain, l'une à 0 UNO et l'autre à 2 000, déplacent les cotes exactement
pareil.

---

## 48. Un jeu d'essai vaut mieux qu'un mode d'emploi

**Le mode SQUAD demande dix comptes pour être essayé** : quatre clubs, des
contributions, une négociation, un transfert. Soit une demi-heure de clics
avant de pouvoir juger quoi que ce soit — et la tentation, à la dixième
minute, de conclure que « ça n'a pas l'air de marcher ».

**Choix retenu** — le jeu d'essai pose deux choses de nature différente :

 - un **passé** — cotes, bilans, séries — écrit directement en base. Il n'a pas
   besoin d'être rejoué pour être crédible, et le rejouer coûterait dix matchs
   complets au démarrage ;
 - un **présent cohérent** — un défi qui attend une réponse, un autre prêt à
   jouer avec ses dix places réglées, un dossier de transfert à trancher, deux
   joueurs sur le marché. Chaque écran a quelque chose à montrer, et chaque
   bouton quelque chose à faire.

**La cohérence du présent n'est pas décorative.** Le défi accepté a ses mises
réellement séquestrées et ses places réellement payées : les caisses affichent
donc des totaux justes, et le règlement rendra exactement ce qui a été pris.
Un jeu d'essai qui poserait un défi accepté sans engager les mises afficherait
une trésorerie fausse dès le premier écran — et ferait douter du code, pas des
données.

**L'administrateur est fondateur du premier club**, parce que c'est de là qu'on
peut tout exercer : composer une feuille, engager la caisse, répondre à un
défi, céder un joueur. Un compte spectateur n'aurait rien prouvé.

**Il est posé même quand le mode est fermé.** Le jeu d'essai ne s'exécute
qu'une fois, sur base vierge : ouvrir le drapeau plus tard ne le rejouerait
pas, et l'on découvrirait un onglet vide.

---

## 49. On ne peut pas être dernier d'une compétition qu'on n'a pas jouée

**Le client** : « Les joueurs qui n'ont joué aucun match n'apparaissent pas au
classement. »

La règle se défend d'elle-même, mais elle avait une conséquence plus grave que
l'affichage : la fin de saison **fait descendre les derniers**. Un compte
inscrit et jamais venu occupait le bas du tableau à zéro point — et se faisait
donc reléguer d'une division où il n'avait jamais joué. Le classement ne
disait pas seulement quelque chose d'inutile, il produisait un effet faux.

**Choix retenu** — `isRankedPlayer` exige désormais une séance au compteur, en
plus du type de compte. La condition est nommée une fois dans
`ranking.service.ts` et vaut pour **toutes** les requêtes du fichier : tableau,
position personnelle, montées et descentes. L'oublier dans une seule suffirait
à faire réapparaître le défaut, comme pour les arbitres avant elle (§35).

**Quatre tests existants sont tombés, et c'était le bon signe.** Ils faisaient
figurer au classement des comptes créés sans jamais jouer — précisément ce que
la règle interdit. Les corriger valait mieux que les affaiblir :

 - celui du double comptage observe maintenant la **carrière** plutôt que le
   classement : il porte sur le fait qu'une seconde validation ne recompte
   rien, pas sur l'affichage ;
 - celui de l'amical **clôture** la séance, ce qui rend son assertion plus
   forte : le joueur figure bien au classement, et il y figure à zéro but ;
 - ceux du filtrage par division et des quotas déclarent en une ligne
   (`markPlayed`) la seule condition qui leur manquait, sans monter une
   session de quinze joueurs pour un test qui parle d'autre chose ;
 - celui de l'arbitre fait désormais jouer **les deux** : l'arbitre est écarté
   pour ce qu'il est, et non faute d'avoir joué.

---

## 50. Un barème se lit avec le mode auquel il s'applique

**Le client** demande de « placer harmonieusement le barème des récompenses
dans le mode UNO League, pour que ce soit clair que ces récompenses sont
valables pour ce mode ».

Le défaut était réel : le barème occupait une section autonome, avant même la
liste des modes. Présenté ainsi, il se lisait comme la règle générale de
l'application — alors qu'un amical ne verse **rien**, et qu'un match SQUAD
paie par la mise et non par le barème. Deux modes sur trois le contredisaient.

**Choix retenu** — le tableau vit dans la carte du mode UNO League, sous le
titre « Récompenses UNO de ce mode ». Le déplacement suffit : l'information
n'a pas changé, c'est son voisinage qui la rendait fausse.

**Et le mode SQUAD y gagne sa carte.** Il figurait jusque-là parmi les
« bientôt disponibles » — la liste se construit sur `schedulable`, et un match
SQUAD ne se propose effectivement pas au calendrier puisqu'il naît d'un défi.
Mais le ranger là revenait à le dire absent alors qu'il est complet. Sa carte
décrit ce qui le distingue : la place et la mise, la cote indépendante des
mises, et le triple accord du marché des transferts.

---

## 51. Un bouton qui échoue toujours vaut moins que pas de bouton

**Le client** : « Avec le rôle de supervision, en allant dans les sessions
passées via le calendrier, j'ai toujours la possibilité de modifier les stats
d'une session. Je ne devrais pas pouvoir le faire. »

**Le serveur était déjà correct**, et testé : `supervision.reopen` est en
`adminProcedure` depuis §39, et un test vérifie qu'un superviseur — même
nommé — se voit refuser. Rien n'a jamais pu passer.

**L'écran, lui, avait été oublié.** Il affichait le bouton de correction à
tout `isSupervisor`, or ce drapeau vaut vrai pour l'administrateur *comme*
pour le superviseur. Ce dernier voyait donc une porte qui ne s'ouvrait jamais.

C'est le même défaut que §35 — un cul-de-sac de navigation — et il mérite
d'être nommé comme tel : **une permission qui n'existe que dans l'interface
est pire qu'une permission absente**. Elle promet, elle échoue, et celui qui
la rencontre ne sait pas s'il a mal fait ou si l'application est cassée. Le
bouton est désormais réservé à `isAdmin`.

---

## 52. La carte d'un joueur se voit là où on parle de lui

**Le client** : « Dans les squads, j'aimerais bien pouvoir cliquer sur un joueur
et voir sa carte FUT. Je pense qu'il serait aussi bien de mettre la carte FUT
(en petit) juste avant le prénom/nom des joueurs. »

Le mode SQUAD manipule des joueurs sur quatre écrans — effectif, gestion,
composition d'un défi, marché des transferts — et chacun les réduisait à une
photo ronde et un nom. C'était perdre l'objet le plus identifiant de
l'application, celui autour duquel tout le reste est construit.

**Choix retenu** — un seul composant, `PlayerChip`, porte le geste partout : la
carte en vignette, le nom, et l'ouverture en grand au toucher. Quatre écrans
répétaient le même bloc « photo + nom » ; c'étaient trois occasions de
diverger, et le jour où l'on aurait voulu ajouter la note ou le poste, il
aurait fallu y penser quatre fois.

**Une taille de carte a été ajoutée**, `xs`, à 26 % de l'original. À cette
échelle les chiffres ne se lisent plus — ce n'est pas le but. La vignette sert
de portrait reconnaissable et d'invitation à ouvrir la vraie carte, là où une
photo ronde ne dit ni le poste, ni la note, ni la division.

**L'animation de révélation est coupée** dans les listes. Elle a du sens sur
une carte qu'on ouvre, aucun sur dix vignettes qui s'affichent d'un coup.

---

## 53. Deux images pour un club, et non une

**Le client** : « Les squads devraient avoir une photo avatar + photo de
couverture. »

La distinction n'est pas cosmétique. **L'écusson identifie** le club dans une
liste ou un classement, à quarante pixels, souvent à côté de neuf autres ;
**le bandeau habille** son écran, en pleine largeur. Une seule image pour les
deux usages serait illisible en petit ou étirée en grand : elle échouerait aux
deux.

**Un dégradé sombre recouvre systématiquement le bandeau.** On ne maîtrise pas
la photo qu'un fondateur choisira, et une image claire rendrait le nom du club
illisible. Le dégradé coûte trois classes et supprime la question.

**Le téléversement passe par le dossier `squads`**, ouvert à tout compte
authentifié — et non à la seule administration comme les produits et les
salles. Le contrôle utile n'est pas là : c'est `squads.update` qui vérifie que
l'auteur est bien le fondateur, et une adresse téléversée qu'aucun club
n'accepte ne devient visible nulle part.

---

## 54. Un total dit ce qu'on a accumulé, pas ce qu'on vaut

**Le client** demande trois choses pour les statistiques du profil : « voir
toutes les statistiques », des « KPI ratio (buts/match, passes décisives/match) »
et des « graphiques (évolution de buts/passes sur le temps) ».

Les trois répondent au même manque. Le profil n'affichait que des cumuls, et
un cumul ne se compare pas : vingt buts en cinq séances et vingt buts en
quarante ne racontent pas la même chose. Il fallait donc la **moyenne** et
l'**évolution**.

### Le dénominateur est la carrière, pas la fenêtre affichée

La courbe est bornée aux trente dernières séances pour rester lisible. Si les
ratios se calculaient sur cette tranche, « buts par séance » changerait selon
la fenêtre d'affichage — un chiffre qui bouge sans que rien ne se soit passé.
Ils divisent donc par le compteur de carrière, et un test le vérifie en
comparant une fenêtre de 30 à une fenêtre de 1.

### La courbe ne montre que les séances qui comptent

Les compteurs de carrière n'avancent que dans les modes qui le prévoient
(§44). Une courbe qui inclurait les amicaux ne retomberait pas sur le total
affiché juste au-dessus — et rien ne fait douter de deux chiffres comme de les
voir se contredire.

### Ce que le graphique doit à la méthode, et non au goût

 - **Une échelle par cadre.** Buts et passes partagent un axe parce qu'ils
   partagent une unité ; la note de carte a son propre cadre. Deux échelles
   superposées feraient apparaître des croisements qui n'existent pas.
 - **Les couleurs sont calculées, pas choisies.** Le couple orange/bleu passe
   les six contrôles — clarté, chroma, séparation sous deutéranopie et
   protanopie, plancher en vision normale, contraste sur fond sombre — avec un
   écart de 24,7 là où 8 est le seuil. Et une légende double l'information :
   l'identité d'une courbe ne repose jamais sur la seule couleur.
 - **Un tableau accompagne les courbes.** Une valeur exacte doit rester
   lisible sans survol et sans distinguer deux teintes.

### Deux défauts trouvés en regardant le rendu

Le premier jet passait la validation de couleur et restait faux à l'œil :

 - la **note de carte partait de zéro**. Une note vit entre 50 et 99 : l'axe
   écrasait six points de variation contre le haut du cadre, et la courbe
   semblait plate. Un dénombrement part de zéro — tronquer sa base exagérerait
   les écarts — mais un indice borné, non. D'où une option explicite ;
 - le **repère médian mentait**. Il était tracé à `max / 2` et étiqueté de la
   valeur arrondie : sur un maximum de 19, le trait était à 9,5 sous une
   étiquette « 10 ». Un axe qui se trompe d'un demi-point sur lui-même
   décrédibilise tout ce qu'on lit autour.

Aucun test n'aurait attrapé ces deux-là. C'est la troisième fois dans ce
projet que le rendu montre ce que la suite ne voit pas (§42, §45).

### Le jeu d'essai a suivi

Les sept séances clôturées faisaient tourner les cohortes : chaque joueur en
comptait une ou deux, de quoi peupler un classement mais pas tracer une
courbe. Quatre séances de plus, sur le **même** effectif, donnent à la cohorte
de tête de chaque division un historique à regarder — sans quoi la
fonctionnalité se découvrirait vide.

## 55. Un bazar ne se range pas dans un ENUM

La boutique devait passer de cinq rayons à quatorze : multimédia, jeux vidéo,
sport, maison, beauté, livres, alimentation, don, autre. La demande n'est pas
« ajoutez cinq catégories », elle est **« le webshop est une sorte d'Amazon, on
y trouve de tout »** — c'est-à-dire une liste qui continuera de s'allonger.

`shop_items.category` était un `ENUM` MySQL. Chaque rayon supplémentaire aurait
donc coûté un `ALTER TABLE ... MODIFY COLUMN` sur la base de production, soit
exactement l'opération qui a fait échouer deux migrations du mode SQUAD (§40).
La colonne devient un `varchar(30)` : la liste fermée vit dans
`SHOP_CATEGORIES`, validée à l'écriture par Zod, et s'allonge désormais sans
toucher au schéma.

### La conversion elle-même ne pouvait pas être celle que l'outil propose

`drizzle-kit` a généré `ALTER TABLE shop_items MODIFY COLUMN category
varchar(30) NOT NULL`. MySQL l'accepte. La documentation de TiDB dit le
contraire, noir sur blanc : *« changing from some data types (for example,
TIME, BIT, SET, ENUM, and JSON) to some other types is not supported »*.

Cette fois la limite a été **lue avant** de lancer la migration, et non
découverte par son échec. La migration 0018 procède donc par les seules
opérations que les deux moteurs tiennent : une colonne neuve, une recopie, la
suppression de l'ancienne, puis un renommage à type constant — un `CHANGE`
sans changement de type, qui n'est qu'une écriture de métadonnées. L'index sur
la catégorie est défait avant et refait après, puisqu'il ne portait que sur
cette colonne. Chaque étape est gardée par `information_schema` : une base déjà
convertie traverse le fichier sans rien faire.

**Et la leçon est devenue un test.** `migration.test.ts` relève les colonnes
déclarées `ENUM`/`SET` dans les `CREATE TABLE`, puis refuse tout `MODIFY` ou
`CHANGE` qui les convertirait vers un autre type — en laissant passer l'ajout
d'une valeur en fin de liste, que TiDB accepte. Le test a été vérifié contre
la forme que `drizzle-kit` avait produite : il la rejette. C'est le deuxième
garde-fou de ce genre, après celui des colonnes générées ; tous deux existent
parce que le développement se fait sur MySQL et la production sur TiDB.

## 56. Un don n'est pas un produit

Le rayon « Don » ressemble à un article — un prix, une fiche, un achat — mais
il s'en distingue sur trois points, et chacun a laissé une trace dans le code.

**Il appelle un bénéficiaire.** L'association est choisie à l'achat, dans une
liste tenue par l'administration : nom, présentation, logo, site officiel. Le
site est **obligatoire** : on confie un don à une organisation qu'on peut
aller vérifier, pas à un nom dans une liste déroulante.

**Le bénéficiaire est porté par la ligne, pas par la commande.** Un panier peut
contenir deux dons destinés à deux associations différentes ; `charity_id` est
donc sur `order_items`. Le nom est figé à côté, comme celui du produit : une
association renommée ou retirée ne réécrit pas l'historique.

**La règle se lit sur la catégorie relue en base**, jamais sur ce que le client
envoie : un don sans association est refusé, une association sur une paire de
chaussures aussi, et une association désactivée entre l'affichage de la liste
et le paiement fait échouer l'achat plutôt que de rediriger le don en silence
vers une autre. Six tests couvrent ces cas, dont le refus qui ne laisse ni
débit ni commande.

Une association n'est jamais supprimée — elle est désactivée, comme une salle
(§25) ou un produit déjà commandé (ADMIN-004). Enfin, un don ne se note pas :
l'écran de détail masque les avis. On ne met pas quatre étoiles à un geste.

## 57. Une boîte à idées qui répond

Les joueurs peuvent proposer un produit : un titre, deux phrases, le lien
d'achat. L'administration retient ou écarte.

**Une proposition retenue n'ajoute rien au catalogue.** Le produit est créé à
la main, avec son prix en UNO, ses images et sa catégorie — toutes décisions
que la ligue ne délègue pas à un lien externe. La table n'est qu'une file
d'attente tracée, et l'écran d'administration le dit en toutes lettres au
moment de retenir une proposition.

**Toute décision revient à son auteur.** Retenue ou écartée, avec le mot qu'on
y joint : une proposition sans réponse décourage la suivante, et la boîte à
idées se vide d'elle-même. La notification passe par `notifyPlayer`, dont la
clé d'évènement rend le rejeu sans effet.

**Cinq propositions en attente par joueur suffisent.** Sans plafond, la file
deviendrait une messagerie adressée à l'administration ; le seuil ne se voit
qu'au moment où l'on essaie d'en envoyer une sixième, et il retombe dès qu'une
décision est prise.

## 58. Une feuille qu'aucun chemin n'atteint

Le match SQUAD devait hériter des rails existants : « une `proposals` en mode
`squad`, ce qui lui donne gratuitement la feuille de match, la saisie en
visionnage et la correction » (§44). L'essai a montré le contraire — sa feuille
n'était accessible par **aucun** chemin. Trois causes, toutes venues d'une
hypothèse silencieuse : *une session à saisir est une session passée, créée par
le calendrier*.

**La file d'attente ne liste que le passé.** Elle a raison : on ne saisit pas
une séance qui n'a pas eu lieu. Mais un match SQUAD est créé dès que les deux
effectifs sont complets et réglés, donc **avant** son coup d'envoi. Entre sa
création et sa date, il n'était nulle part.

La réponse n'est pas d'élargir la file — ce serait proposer de saisir des
rencontres à venir — mais d'ouvrir la feuille **depuis la session elle-même** :
un bouton sur la feuille de match, une adresse `/sessions/:id/saisie`, et un
avertissement quand la date n'est pas passée. L'écran signale l'anomalie plutôt
que de l'interdire : c'est l'administration qui sait ce qui s'est joué.

**La saisie en visionnage forçait « UNO League ».** L'écran envoyait ce mode
pour toute feuille, y compris rattachée. Une feuille de match SQUAD serait donc
née avec trois équipes tirées au sort et le barème de la League. Le mode d'une
feuille rattachée est désormais **celui de sa session**, et la liste des
sessions à reprendre affiche ce mode plutôt que de le laisser deviner.

**Et les équipes étaient retirées au sort.** La feuille refaisait un tirage par
niveau, là où la session portait déjà deux clubs. Quand la session a ses
équipes, elles sont recopiées telles quelles, noms compris. Dans la foulée,
`assignTeam` refuse de déplacer un joueur d'un camp à l'autre sur un match
SQUAD : ce serait le faire jouer pour un club dont il n'est pas membre, et dont
la place n'a pas été payée. L'écran retire le sélecteur, le serveur refuse
l'appel.

## 59. Compter les buts de quelqu'un ne suffit pas à l'inscrire

Une feuille rattachée reprend les inscrits de la session, et on y ajoute ceux
qui ont réellement joué — un remplaçant venu au pied levé. La publication leur
comptait bien leurs buts : le relevé se lit sur la feuille, pas sur la liste
des inscrits.

Mais l'inverse n'était pas vrai. L'historique, les séances jouées, les ratios
et le classement se lisent tous sur `proposal_participants`, où personne ne les
avait inscrits. Un joueur pouvait donc être **meilleur buteur d'une séance
absente de son historique** — c'est exactement ce que le client a observé.

La publication inscrit désormais à la session tous les joueurs de la feuille
qui n'y figuraient pas, et met à jour ses compteurs. Leur place est marquée
réglée, comme sur une feuille libre : la feuille dit qu'ils ont joué, et
l'encaissement — s'il a eu lieu — s'est fait hors de l'application. C'est aussi
ce qui leur vaut la récompense de participation et le crédit d'une séance
jouée, sans quoi on aurait corrigé l'historique en laissant les ratios faux.

## 60. Un refus qui arrive trop tard n'en est pas un

Un superviseur ne publie pas une feuille où il figure : la règle existait, et
elle était tenue — **à la publication**. Entre-temps, il pouvait reprendre sa
propre séance, composer les équipes, relever les actions une par une, et ne se
voir refuser qu'au dernier geste. Deux heures de visionnage pour un message
d'erreur.

Le refus remonte donc à l'entrée : sa séance ne lui est plus proposée dans la
liste des sessions à reprendre, une feuille où il figure ne s'ouvre pas, ne
s'écrit pas et n'apparaît pas dans sa liste de travail. L'administration en
reste dispensée, comme partout ailleurs — c'est elle qui tranche les litiges.

Les routes qui ne portent qu'un identifiant de joueur de feuille ou de match
relisent la feuille avant d'agir : une garde qui ne tient que sur les routes
commodes n'est pas une garde.

## 61. Une case dans une grille qu'on ne regardait pas

Le choix « joueur ou arbitre » de l'inscription vivait à l'intérieur de la
grille à deux colonnes des noms. Il occupait donc la première cellule, et
poussait « Prénom » à sa droite, sur la même ligne — une colonne de deux
boutons face à un champ de saisie. Le bloc tient désormais sur toute la
largeur, et la grille ne contient plus que ce pour quoi elle a été écrite :
« Prénom » et « Nom », côte à côte.

## 62. Les actes qui engagent le club

Défier, contre-offrir, accepter, refuser, retirer un défi : chacun engage la
mise du club, sa caisse et sa cote. Le serveur le tenait déjà — `assertSquadRole`,
dans la même transaction que l'écriture — mais l'écran offrait « Lancer un
défi » à n'importe quel membre, qui n'obtenait qu'un refus.

L'écran s'aligne : le bouton n'apparaît plus qu'au fondateur et aux
capitaines, l'adresse directe de l'écran de création est gardée de la même
manière, et les boutons de réponse à un défi suivent la même règle. Un membre
ordinaire lit ce que devient le défi de son club, et sait pourquoi il n'y peut
rien — c'est la règle §51 appliquée aux SQUADs.

## 63. Détourer une photo sans l'envoyer nulle part

La demande tenait en une phrase : que le joueur poste une photo de lui et que
le fond disparaisse tout seul. La solution la plus courte aurait été une API
de détourage — dix lignes, quelques centimes par image. Elle a été écartée
sans hésiter : **une photo de visage est une donnée sensible**, et l'envoyer
chez un tiers pour gagner dix lignes est le plus mauvais échange possible.

Tout se passe donc sur l'appareil. MediaPipe fournit deux modèles qui tournent
en WebAssembly dans le navigateur comme dans l'application : un segmenteur qui
sépare la personne de son fond, et un détecteur de repères faciaux. Le masque
du premier devient le canal alpha de l'image ; la transition est adoucie entre
35 % et 70 % de confiance, sans quoi les contours des cheveux forment un
escalier.

**Le prix de ce choix est le poids** : 12 Mo de moteur et 4 Mo de modèles. Ils
ne sont chargés qu'à l'ouverture de l'écran de photo — jamais au démarrage —
puis mis en cache ; dans l'application mobile, ils sont embarqués et
fonctionnent hors ligne. Le moteur, restituable à l'identique par
`pnpm install`, n'est pas versionné : un script le recopie avant chaque build.
Les modèles, eux, le sont — ils ne viennent d'aucun paquet npm, et les
télécharger au build rendrait la construction dépendante d'un service tiers.

Le résultat sort en WebP transparent : quarante kilo-octets contre deux cents
en PNG, pour une image qu'on regarde sur un forfait mobile. Le recadrage suit
la règle des photos officielles — la tête occupe environ les deux tiers de la
hauteur, le regard au tiers supérieur — et **le fond peut être conservé** d'une
case à cocher : un détourage raté sur une photo qu'on aime doit pouvoir être
annulé.

## 64. Vérifier une photo sans juger les gens

Le contrôle demandé était « une photo de face, type carte d'identité, sans
accessoires sur le visage ». Les deux premiers points se mesurent ; le
troisième, non — et c'est là que la fonctionnalité pouvait devenir nuisible.

**Ce qui est mesuré** : le nombre de visages, la part de l'image qu'occupe la
tête, si elle est entière dans le cadre, les trois angles de la tête tirés de
la matrice de transformation faciale, l'ouverture des yeux lue dans les
coefficients d'expression, la netteté (variance du laplacien) et la
luminosité. Ces mesures ne sont jamais transmises ni conservées : elles vivent
le temps d'afficher un verdict.

**Ce qui n'est pas mesuré** : ce que la personne porte. Aucun modèle embarqué
ne distingue de façon fiable des lunettes de vue de lunettes de soleil, et
surtout : le standard des photos officielles demande un visage visible du
menton à la racine des cheveux, les yeux dégagés — il n'interdit pas un
couvre-chef. Refuser automatiquement un voile ou un turban serait
discriminatoire, en plus d'être illégal dans plusieurs pays où cette
application a vocation à tourner. L'écran demande donc de retirer lunettes de
soleil, casquette et masque ; ce sont **les yeux ouverts et visibles** et le
**visage de face** qui sont vérifiés. Un test protège explicitement ce choix.

**Deux niveaux de verdict.** Ce qui bloque doit être incontestable : pas de
visage, plusieurs visages, visage coupé par le bord, tête franchement tournée,
yeux fermés, photo floue ou noire — autant de cas qu'on reprend en trois
secondes. Le reste avertit sans interdire. Un refus de trop coûte plus cher
qu'une photo imparfaite.

**Une règle a été retirée après l'essai** : le décentrage. L'écran le
reprochait sur une photo parfaitement utilisable — alors que le recadrage
automatique se fait autour du visage, et donne le même portrait que la tête
soit au centre ou sur le côté. Signaler un défaut qu'on vient de corriger
soi-même apprend aux gens à ignorer les messages. Ce qui compte, c'est que le
visage soit entier dans l'image : c'est la marge au bord qui le vérifie.

## 65. L'inscription ne s'arrête pas à la création du compte

La photo se prend juste après l'inscription, au moment où l'on est disponible.
Elle ne peut pas se prendre **pendant** : envoyer une image demande une
session, et faire dépendre la création d'un compte d'une permission caméra
reviendrait à perdre le joueur au premier refus. L'étape est donc seconde, et
sautable — une carte sans photo reste une carte, et l'écran de profil propose
la même prise de vue à tout moment.

Le premier essai naviguait vers une adresse dédiée après l'inscription. Elle
n'était jamais atteinte : la garde « déjà connecté » de l'écran d'inscription
redirigeait vers l'accueil à l'instant où la session s'ouvrait, et gagnait la
course. La leçon vaut au-delà de ce cas : **deux mécanismes qui naviguent en
même temps finissent toujours par se contredire**. L'écran d'inscription
héberge donc lui-même sa seconde étape, et la garde a disparu — un seul
endroit décide de ce qui s'affiche.

## 66. Essayer la caméra depuis un téléphone demande du HTTPS

`pnpm dev:mobile` servait la page en clair. C'était sans conséquence tant que
l'application ne faisait que lire et écrire des données ; l'arrivée de la
photo de profil l'a rendu bloquant. Les navigateurs ne donnent la caméra —
comme la géolocalisation ou les notifications — qu'à un **contexte sécurisé**.
`localhost` en est un par convention, `http://192.168.1.42:5173` non. La
fonctionnalité qu'on voulait précisément essayer sur un vrai téléphone était
donc la seule qu'on ne pouvait pas y essayer.

Le serveur de développement passe en HTTPS avec un certificat auto-signé, à
accepter une fois sur le téléphone. Trois détails devaient s'accorder pour que
ce soit utilisable :

 - **le relais vers l'API devient obligatoire.** Une page HTTPS ne peut pas
   appeler une API en clair : le navigateur bloque le mélange, sans message
   lisible. Le proxy existait déjà pour éviter CORS ; il porte désormais aussi
   cette contrainte ;
 - **les photos envoyées doivent porter une adresse joignable.** L'API les
   publiait sous `http://localhost:4000` — une adresse qui, vue du téléphone,
   désigne le téléphone. Elle est réécrite au lancement vers le serveur de
   développement, qui relaie déjà ;
 - **le port ne doit pas glisser.** Vite prend le port suivant quand le sien
   est occupé. Commodité ailleurs, piège ici : l'adresse annoncée et celle des
   photos sont calculées avant le démarrage. La commande refuse désormais de
   démarrer plutôt que de livrer une adresse fausse.

Deux autres pannes ont été corrigées au passage. `dev:lan` ne recopiait pas le
moteur de vision — `pnpm` n'exécute `predev` que pour `dev` — si bien qu'un
poste fraîchement cloné aurait démarré sans détourage, silencieusement. Et le
lanceur passait ses arguments à `concurrently` sous forme de tableau avec
`shell: true`, ce qui recolle les arguments **sans** leurs guillemets : sous
Windows, `pnpm --filter @uno/api dev` se scindait en deux commandes dont la
seconde n'existait pas.

Enfin, l'écran de photo distingue maintenant ses deux causes d'échec. Un
navigateur sans caméra et une page non sécurisée produisent la même absence
d'API côté code ; un message unique aurait envoyé chercher la panne du mauvais
côté. Et le bouton de déclenchement attend que la caméra ait réellement une
image : entre l'autorisation et la première image, un téléphone met parfois
deux secondes, et un message d'erreur après coup vaut moins qu'un bouton qui
attend d'être utile.

## 67. L'adresse d'un serveur n'appartient pas à la donnée

Premier essai sur iPhone : **aucune image**. Ni la photo du joueur, ni celles
des autres, ni les couvertures de club. Et sur le PC, l'inverse exact : tout
s'affichait sauf la photo envoyée depuis le téléphone.

Les deux symptômes n'en font qu'un. Une image envoyée était enregistrée sous
la forme `http://localhost:4000/uploads/avatars/x.webp` — l'adresse par
laquelle le serveur se joignait **lui-même, au moment de l'envoi**. Vue du
téléphone, `localhost` désigne le téléphone : rien. Vue d'une page servie en
HTTPS, une adresse en clair est bloquée par-dessus le marché. Et la photo
envoyée depuis le téléphone, enregistrée sous l'adresse du Wi-Fi, était
illisible depuis le PC.

Le défaut n'était pas dans le mode téléphone : il l'a seulement révélé. Une
application qu'on ne joint que par `localhost` ne peut pas s'en apercevoir.

**Un chemin appartient à la donnée, un hôte non.** Les fichiers sont désormais
enregistrés sous `/uploads/avatars/x.webp`, sans hôte, et le navigateur résout
ce chemin contre l'origine par laquelle il est arrivé — quelle qu'elle soit.
En production, où l'API vit sur un autre domaine que le site, l'application y
ajoute `VITE_API_URL` ; c'est la seule chose qu'elle sait et que la base
ignore.

**Les anciennes lignes sont ramenées à leur chemin à l'affichage.** Une
adresse qui désigne une machine locale — `localhost`, une IP privée, un nom en
`.local` — n'est de toute façon utilisable nulle part ailleurs : on n'en garde
que le chemin. Une adresse extérieure, elle, est laissée intacte : un bucket
S3 ou un CDN se joint de partout, et la réécrire casserait tout. Cette règle
évite une migration de colonnes JSON sur deux moteurs de base de données pour
un défaut qui se corrige en dix lignes au bon endroit.

**Une garde ferme la porte au retour du problème** : avec `STORAGE_DRIVER=s3`,
un préfixe relatif empêche désormais l'API de démarrer. Le fichier n'étant pas
servi par elle, un chemin relatif pointerait vers une API qui ne l'a pas — et
les images manqueraient sans que rien ne le dise.

