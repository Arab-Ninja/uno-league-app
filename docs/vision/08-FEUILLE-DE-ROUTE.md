# Feuille de route

Six phases jusqu'à la V1, puis une V2. Chaque phase a un **critère de
sortie** : tant qu'il n'est pas tenu, la suivante n'ouvre pas. Les durées
sont des ordres de grandeur pour une personne à temps partiel ; elles
servent à ordonner, pas à promettre.

Le fil conducteur : **le radar d'abord**. Tant qu'on ne sait pas où sont les
joueurs et le ballon en mètres, aucune action ne vaut rien. Tout le reste
est bon marché une fois le radar là.

---

## Phase 0 — Fondations *(1 semaine)*

| Livrables |
|---|
| cette documentation, relue et corrigée des points à confirmer |
| dépôt `arab-ninja/uno-league-vision` créé, avec la structure de `02-ARCHITECTURE.md`, CI (types, tests, licences) |
| environnement Python avec PyTorch CUDA sur le PC de l'admin, vérification du GPU |
| **jalon J0** : détection de personnes avec RT-DETRv2-R18 (poids COCO) sur une vidéo de centre five : débit mesuré, mémoire mesurée |
| un gabarit de terrain et un premier calibrage manuel (script, pas encore d'écran) sur une vidéo de centre similaire |

**Sortie** : le débit mesuré à J0 confirme qu'une session de 2 h tient sous
12 h (VIS-NF-001). Sinon, les réglages (une image sur deux, résolution) sont
fixés avant d'aller plus loin.

---

## Phase 1 — Le radar *(2 à 3 semaines)*

| Livrables |
|---|
| ingestion : ffprobe, version 720p, plusieurs fichiers par session |
| calibrage : correction fish-eye par lignes, homographie par points cliqués, erreur de reprojection, polygone terrain et zone aveugle |
| détection + suivi (ByteTrack) persistés en Parquet |
| rôles : sur le terrain ou non, équipe par couleur de chasuble, arbitre |
| radar : projection, lissage, vitesses ; **vidéo de contrôle** avec le radar incrusté, comme le screenshot de référence |
| amorce du jeu de données : 300 images annotées, premier affinage du détecteur |

**Sortie** : sur deux vidéos de centre similaire, le radar incrusté est
visuellement juste (joueurs au bon endroit, pas de piste hors terrain), et
la course chronométrée donne une vitesse à moins de 20 % de la référence.

---

## Phase 2 — Le ballon et les règles *(2 à 3 semaines)*

| Livrables |
|---|
| détection du ballon en pleine résolution ou par tuiles ; trajectoire, interpolation, état porté / libre / en vol |
| possession, passes, reprises de jeu |
| les règles de `04-REGLES-DE-DEDUCTION.md`, une par fichier, avec leurs tests sur radars synthétiques |
| métriques physiques et de possession |
| `events.json` avec confiance et preuves ; export CSV complet |
| `rules.yaml` versionné |

**Sortie** : sur une vidéo de centre similaire avec un score connu, les buts
sont tous trouvés, sans but fictif ; les tirs, arrêts et défenses sont
proposés avec des preuves lisibles. Les tests de règles passent en CI.

---

## Phase 3 — La supervision *(3 à 4 semaines)*

| Livrables |
|---|
| `vision-api` : sessions, vidéos, salles, calibrages, effectifs, analyses en file, actions, revues |
| `vision-worker` : exécution des analyses, relance des étapes aval |
| `vision-web` : tous les écrans de `05-SUPERVISION.md` sauf le tableau de bord et les campagnes |
| revue des actions au clavier, extraits vidéo + radar synchronisés |
| identités : mosaïque, reprises de piste, correction à partir d'un instant |

**Sortie** : l'admin traite une session de bout en bout — vidéos, calibrage,
effectif, analyse, identités, coups d'envoi, revue, CSV — sans ligne de
commande. Temps de revue mesuré.

---

## Phase 4 — L'intégration UNO League *(1 à 2 semaines, les deux dépôts)*

| Livrables côté UNO League (lot V1-UNO, `06-CONTRAT-ECHANGE.md` §7) |
|---|
| jeton machine et `machineProcedure` |
| types `shot_on_target`, `shot_off_target` |
| table et procédure des métriques |
| consentement vidéo |

| Livrables côté UNO Vision |
|---|
| client tRPC, le flux du §3 du contrat, mémorisation des identifiants, ré-envoi après corrections |
| écran Export : envoi, lien vers `/admin/tracker` |

**Sortie** : une session analysée apparaît dans `/admin/tracker` comme une
feuille en brouillon, et sa publication passe par le chemin existant, sans
rien de particulier. Un second envoi après corrections ne crée pas de
doublon (test d'intégration côté UNO League).

---

## Phase 5 — Première campagne sur de vraies sessions *(en continu)*

| Livrables |
|---|
| trois à cinq sessions UNO League réelles filmées selon `03-TOURNAGE-ET-CALIBRAGE.md`, calibrage de chaque salle |
| jeu d'or constitué (VIS-QUA-002) |
| campagne d'affinage sur nos salles (1 000 à 1 500 images), évaluation, promotion |
| réglage des seuils (`tools/tune_rules.py`), évaluation, promotion |
| tableau de bord de l'IA |
| rapport d'évaluation versionné |

**Sortie V1** : les cibles de `07-DONNEES-ET-ENTRAINEMENT.md` §4 atteintes
sur le jeu d'or, ou l'écart documenté avec sa cause ; temps de revue sous
15 minutes par match ; documentation d'exploitation (installation, session
type, calibrage, purge) à jour.

---

## V2 — Après la V1, dans l'ordre où cela rapporte

| Sujet | Ce qui l'ouvre |
|---|---|
| **classificateur d'actions** sur les attributs des règles (défenses, arrêts) | assez d'actions revues : quelques centaines par type |
| **ré-identification par apparence** pour les reprises de piste | les corrections d'identité accumulées |
| **lecture des numéros** de chasuble | des images de chasubles annotées ; dépend de la résolution |
| **hauteur du ballon** (tirs au-dessus) | données de tirs revus avec leur issue |
| **coups d'envoi proposés** par l'IA | les engagements déjà reconnus par la règle de but |
| **fautes** : arrêt du jeu, arbitre, coup de sifflet (audio) | un signal audio exploitable sur les caméras |
| **caméra mobile** : calibrage par image par détection des lignes | un modèle de points-clés de terrain, entraîné sur nos salles |
| **football à 7-11** | un gabarit, des seuils, et le calibrage mobile |
| **plusieurs superviseurs** | PostgreSQL et authentification |

---

## Risques, et ce qui est prévu

| Risque | Effet | Parade prévue |
|---|---|---|
| le ballon est trop petit sur les caméras de coin | défenses, arrêts, tirs peu fiables | tuiles pleine résolution ; campagne ciblée sur le ballon ; GoPro haute en secours |
| les caméras des centres ne sont pas accessibles ou changent de réglage | pas de source stable | GoPro sur trépied, montage B |
| le temps d'annotation manque | la perception stagne | pré-annotation ; sélection active des images ; 100 par mois suffisent en croisière |
| les chasubles se ressemblent | équipes fausses | trio de couleurs imposé ; alerte au calibrage |
| les seuils tournent au cas par cas | règles instables | réglage par campagne seulement, promotion sur le jeu d'or |
| le GPU de 8 Go ne suffit pas à un modèle plus grand | plafond de qualité | location à l'heure, images seules |
| les vraies sessions tardent | pas de domaine cible | tout se construit sur les vidéos de centres similaires ; seules les équipes par couleur attendent |
