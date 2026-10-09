# Décisions

Les choix qui engagent le projet, avec ce qu'ils coûtent. Une décision se
discute ici, pas dans le code. Numérotées, datées, jamais effacées : une
décision renversée reste, barrée de la nouvelle.

---

## D-01 — Un radar et des règles, pas un modèle qui regarde la vidéo

**Contexte.** Deux voies pour « reconnaître un but » : un réseau entraîné
sur des clips étiquetés par action, ou une reconstruction des positions
suivie de règles.

**Décision.** Le radar et les règles. Le seul modèle appris est le
détecteur d'objets ; tout le reste est déterministe et lisible.

**Conséquences.** Les actions sont explicables et corrigeables par un seuil ;
les statistiques physiques viennent gratuitement ; il faut des boîtes à
annoter, pas des clips. Le plafond de qualité des défenses et arrêts est
celui du suivi du ballon ; un classificateur appris viendra le relever en
V2, nourri par les règles plutôt qu'à leur place.

## D-02 — Un dépôt séparé

**Décision.** `arab-ninja/uno-league-vision`, en Python. UNO League reste
un monorepo TypeScript sans dépendance GPU.

**Conséquences.** Deux CI, deux cycles de version, un contrat d'échange
versionné dans les deux dépôts. Rien de l'IA ne casse UNO League.

## D-03 — L'API comme canal, le CSV comme archive

**Décision.** UNO Vision écrit dans UNO League par le routeur `tracker`
existant, avec un jeton machine. Les CSV sont produits à chaque export et
archivés, et un import CSV de secours existe.

**Conséquences.** Aucune duplication de la logique de feuille, de score ni
de publication : c'est le chemin existant. Il faut un jeton et une
procédure d'authentification machine dans UNO League, et le contrat vit
dans les deux dépôts.

## D-04 — L'IA produit des actions, pas des compteurs

**Décision.** Le format de sortie est `TrackerEvent` : une action datée,
avec auteur, passeur, équipe, horloge, timecode. Les totaux se déduisent
dans UNO League, comme pour une saisie manuelle.

**Conséquences.** Chaque chiffre reste justifiable par un extrait vidéo ;
le score ne peut pas contredire les buteurs ; les contrôles de cohérence
d'UNO League s'appliquent sans rien ajouter.

## D-05 — Caméra fixe et calibrage manuel par salle en V1

**Décision.** Pas de détection automatique du terrain à chaque image en V1.
Le calibrage se fait une fois par salle et par emplacement, à la main, et
se réutilise.

**Conséquences.** Dix minutes par salle, une fois ; la caméra tenue à la
main attend la V2. L'étape de calibrage est isolée pour être remplacée
sans toucher au reste.

## D-06 — Pas de reconnaissance faciale

**Décision.** L'identité vient de la chasuble (couleur, numéro) et de la
désignation de l'admin. Aucun gabarit biométrique n'est calculé.

**Conséquences.** Un clic par joueur au début de chaque match, et une liste
de reprises de piste à confirmer. En échange, pas de donnée de l'article 9
du RGPD, et pas de dépendance à des modèles de visage, souvent sous licence
restrictive.

## D-07 — Ce qui coûte se persiste, ce qui est bon marché se recalcule

**Décision.** Détections et pistes sont écrites en Parquet et ne se
recalculent qu'avec un nouveau modèle. Identités, radar, possession,
actions et métriques se recalculent à chaque correction.

**Conséquences.** La supervision est interactive ; changer un seuil ne
coûte rien ; l'espace disque d'une session (quelques centaines de Mo de
Parquet) est le prix.

## D-08 — La publication reste humaine, dans UNO League

**Décision.** UNO Vision crée des feuilles en brouillon et ne publie
jamais. Le jeton machine n'en a pas le droit.

**Conséquences.** Un passage par `/admin/tracker` à chaque session ; en
échange, rien de ce que l'IA fait n'atteint le classement sans un regard.

## D-09 — GPU local d'abord, location à l'heure en repli

**Décision.** La RTX 2070 Super (8 Go) porte l'inférence et les campagnes
d'affinage. Si une campagne la dépasse, un GPU se loue à l'heure, en
n'envoyant que des images annotées.

**Conséquences.** Zéro coût fixe ; les modèles sont choisis pour tenir dans
8 Go (R18, R34, RF-DETR jusqu'à Medium). Le RGPD encadre le repli.

## D-10 — Pas de licence AGPL

**Décision.** Le projet est commercial et fermé. Ultralytics YOLO
(AGPL-3.0) est exclu ; RT-DETRv2, RF-DETR, D-FINE (Apache 2.0) sont les
candidats. La CI vérifie les licences.

**Conséquences.** On renonce à l'outillage le plus répandu, et à ses
tutoriels. Les alternatives sont au même niveau de précision ; le prix est
un peu plus de code d'entraînement à écrire.

## D-11 — SQLite et fichiers, pas de serveur de base

**Décision.** Un fichier SQLite pour l'état, des Parquet pour les volumes,
pas de Redis ni de PostgreSQL en V1.

**Conséquences.** Installation en une commande, sauvegarde par copie de
dossier. Le jour où deux personnes supervisent, PostgreSQL remplace SQLite
sans changer l'API.

## D-12 — Même pile front qu'UNO League

**Décision.** React, Vite, Tailwind, TanStack Query, en français, textes
dans des fichiers de traduction.

**Conséquences.** Les réflexes et les composants de la saisie en visionnage
se transfèrent ; un jour, l'écran de supervision peut même s'héberger dans
UNO League sans réécriture.

## D-13 — La confiance est un ordre de revue, pas une probabilité

**Décision.** La confiance d'une action trie la revue ; elle ne décide
jamais seule d'exporter ou non.

**Conséquences.** Tout est revu en V1. Le tableau de bord mesure si la
confiance trie bien ; c'est lui qui autorisera, plus tard, de ne revoir que
le doute.

## D-14 — Les seuils s'apprennent par campagne, pas par session

**Décision.** Les paramètres des règles sont réglés par un outil, sur
plusieurs sessions revues, versionnés et évalués sur le jeu d'or avant
promotion.

**Conséquences.** Les règles ne dérivent pas au gré d'un match atypique ;
l'historique des versions se lit dans git.

## D-15 — Les fautes attendent la V2

**Décision.** Aucune règle de faute en V1 : le radar ne porte pas de signal
fiable, et une faute fausse coûterait plus qu'une faute manquée.

**Conséquences.** La feuille d'UNO League ne les compte pas non plus
aujourd'hui ; rien n'est perdu. L'audio (coup de sifflet) et la position de
l'arbitre sont les pistes de la V2.

## D-16 — Les caméras des centres en 720p sont la source par défaut

**Contexte.** Les centres livrent une image 720p, grand angle, depuis un
coin, avec le coin sous la caméra hors champ. Une GoPro en 1080p ferait
mieux, au prix d'une installation à chaque session.

**Décision.** La caméra du centre est la source par défaut ; la GoPro sur
trépied est le montage de secours, par salle, quand le ballon ou le but du
côté de la caméra se révèlent trop mal vus.

**Conséquences.** Le détecteur est affiné en priorité sur ces caméras, avec
des images du fond du terrain ; le ballon se détecte sur l'image native ;
les cibles de rappel du ballon sont abaissées sur ce montage. Rien à
installer avant une session, et des vidéos en nombre pour apprendre.
