# Architecture

## 1. Vue d'ensemble

Trois programmes, un seul poste : le PC de l'admin, qui porte le GPU.

```
┌──────────────────────────────── PC de l'admin ────────────────────────────────┐
│                                                                               │
│   vision-web (React)  ──HTTP──►  vision-api (FastAPI)  ──SQL──►  SQLite       │
│   l'écran de supervision         l'état, les actions,            + fichiers   │
│                                  la file des analyses            (Parquet,    │
│                                        │                          JSON, MP4)  │
│                                        ▼                                      │
│                              vision-worker (Python, GPU)                      │
│                              la chaîne de traitement                          │
│                                                                               │
└───────────────┬──────────────────────────────────────────────┬────────────────┘
                │ HTTPS, jeton machine                         │ S3 (optionnel)
                ▼                                              ▼
       API UNO League (tRPC, routeur tracker)          archivage vidéos et CSV
```

| Composant | Rôle | Pourquoi séparé |
|---|---|---|
| `vision-worker` | exécute les étapes de la chaîne, du fichier vidéo aux actions ; seul à toucher le GPU | une analyse dure des heures et ne doit pas dépendre d'un onglet ouvert |
| `vision-api` | expose l'état aux écrans, écrit en base, met les analyses en file, parle à UNO League | un seul point d'écriture, comme dans UNO League |
| `vision-web` | les écrans de supervision | même pile que UNO League (React, Vite, Tailwind) : les composants et les réflexes se transfèrent |

La base est un fichier **SQLite** : un seul utilisateur, un seul poste, aucune
concurrence. Les gros volumes (détections par image, positions radar) ne vont
pas en base mais dans des fichiers **Parquet** à côté, lus par colonnes et
compressés. Migrer vers PostgreSQL le jour où plusieurs personnes supervisent
ne change que la chaîne de connexion.

---

## 2. La chaîne de traitement

Dix étapes. Chacune lit les artefacts de la précédente et écrit les siens.
C'est la règle qui commande toute l'architecture : **ce qui coûte cher se
calcule une fois, ce qui est bon marché se recalcule à volonté**. Une
correction de l'admin — une identité, un coup d'envoi, un seuil — relance les
étapes aval seulement.

| # | Étape | Entrée | Artefact produit | Coût | Relancée quand |
|---|---|---|---|---|---|
| 1 | **Ingestion** | fichiers vidéo | `videos.json` (durée, cadence, résolution, horodatages) ; version 720p pour la lecture | CPU, minutes | jamais |
| 2 | **Calibrage** | une image, le gabarit de la salle, les points cliqués | `calibration.json` (paramètres de distorsion, homographie, polygone du terrain, zone aveugle) | humain, 5 min par salle | la caméra a bougé |
| 3 | **Détection** | images, modèle | `detections.parquet` (image, classe, boîte, score) | **GPU, heures** | nouveau modèle |
| 4 | **Suivi** | détections | `tracks.parquet` (image, piste, boîte) | CPU, minutes | nouveau modèle |
| 5 | **Rôles et identités** | pistes, calibrage, couleurs déclarées, désignations de l'admin | `identities.json` (piste → équipe, arbitre, numéro, joueur, intervalles) | CPU, secondes | une désignation change |
| 6 | **Radar** | pistes, identités, calibrage | `radar.parquet` (image, identité, x, y en mètres, vitesse lissée) | CPU, secondes | 2 ou 5 changent |
| 7 | **Ballon** | détections ballon, radar | `ball.parquet` (image, x, y, vu/interpolé, vitesse) ; `possession.parquet` (intervalles porteur) | CPU, secondes | 6 change |
| 8 | **Déduction** | radar, possession, coups d'envoi, paramètres des règles | `events.json` (actions proposées, confiance, preuves) | CPU, secondes | n'importe quoi en amont, ou un seuil |
| 9 | **Métriques** | radar, possession, coups d'envoi | `metrics.json` (physique, possession, passes, par joueur et par match) | CPU, secondes | idem |
| 10 | **Export** | actions revues, métriques, effectif | dossier CSV + `manifest.json` ; appels API UNO League | réseau | à la demande |

Les étapes 3 et 4 sont les seules longues. Les étapes 5 à 9 tiennent dans la
minute pour une session de deux heures : c'est ce qui rend la supervision
interactive — l'admin corrige une identité et voit les actions se refaire.

### Détail des étapes

**1. Ingestion.** Un fichier déposé, ou une **adresse URL** d'un MP4 (les
centres livrent souvent un lien) : le worker télécharge dans
`VISION_DATA_DIR`, puis `ffprobe` lit les métadonnées et `ffmpeg` produit la
version de lecture (720p, ou l'original s'il l'est déjà) et, pour les
caméras à cadence variable, un fichier à cadence constante. Les images ne
sont jamais extraites sur disque : le worker décode en flux.

**2. Calibrage.** Décrit dans `03-TOURNAGE-ET-CALIBRAGE.md`. Sortie : une
fonction *pixel → mètre* pour le plan du sol, un polygone « terrain » en
pixels, un polygone « zone aveugle » en mètres.

**3. Détection.** Un détecteur d'objets à deux classes, `person` et `ball`,
affiné sur nos salles. Les personnes se détectent sur l'image réduite
(640 px de large) ; le ballon, petit, demande la pleine résolution ou un
découpage en tuiles (voir §4). Le détecteur tourne sur une image sur deux
par défaut (15 images/s pour une vidéo à 30) : le suivi interpole, et c'est
le réglage qui divise le temps par deux sans effet mesurable sur les actions.
Réglable par session.

**4. Suivi.** ByteTrack : il associe les détections d'une image à l'autre par
recouvrement de boîtes et par prédiction de mouvement, et conserve les
détections faibles, précieuses quand un joueur est partiellement caché. Pas
de réseau de ré-identification en V1 : le calcul reste sur CPU.

**5. Rôles et identités.** Quatre questions par piste :
- *Sur le terrain ?* Le point de contact au sol (milieu du bas de la boîte)
  est projeté en mètres ; hors polygone, la piste est ignorée.
- *Quelle équipe ?* Histogramme de teinte du torse (tiers central de la boîte)
  comparé aux couleurs déclarées pour la session ; vote sur toute la durée de
  la piste.
- *Arbitre ?* Couleur hors des deux équipes du match, et comportement : il ne
  tient jamais le ballon.
- *Qui ?* La désignation de l'admin au début du match, propagée tant que la
  piste tient ; à la reprise d'une piste, proposition par couleur, numéro
  lisible, et proximité de la dernière position connue.

**6. Radar.** Projection des pieds en mètres, puis lissage (filtre de
Savitzky–Golay sur 0,5 s). La vitesse est la dérivée de la position lissée.

**7. Ballon.** Trajectoire filtrée par un filtre de Kalman, interpolation des
trous courts, état *porté / libre / en vol* par la proximité au joueur le
plus proche et la vitesse du ballon.

**8. Déduction.** Les règles de `04-REGLES-DE-DEDUCTION.md`, implémentées
comme des fonctions pures sur les tables radar et possession. Chaque règle
renvoie des actions avec leurs preuves. Les paramètres viennent d'un fichier
`rules.yaml` versionné.

**9. Métriques.** Agrégations par joueur, par match et par session.

**10. Export.** Décrit dans `06-CONTRAT-ECHANGE.md`.

---

## 3. Pile technique et licences

Le projet est commercial et fermé : aucune dépendance **AGPL** (qui obligerait
à publier le code), ni aucune licence « non commerciale ». La CI vérifie la
liste à chaque changement de dépendance (`pip-licenses`).

| Besoin | Choix | Licence | Remarque |
|---|---|---|---|
| Langage | Python 3.11+ | PSF | — |
| Calcul | PyTorch (CUDA 12) | BSD-3 | — |
| Détection | **RT-DETRv2** (R18 ou R34) en premier candidat ; RF-DETR (Nano à Medium) et D-FINE comme alternatives | Apache 2.0 | **pas Ultralytics YOLO**, sous AGPL-3.0 |
| Petits objets | tuilage de l'image (SAHI ou `supervision.InferenceSlicer`) | MIT | pour le ballon |
| Suivi | ByteTrack (implémentation `supervision`) ; BoT-SORT en option | MIT | — |
| Image et vidéo | OpenCV, FFmpeg appelé en processus externe | Apache 2.0 ; LGPL | FFmpeg n'est pas lié au programme |
| Tableaux | NumPy, pandas, PyArrow (Parquet) | BSD, Apache 2.0 | — |
| API | FastAPI, Pydantic, SQLAlchemy | MIT | — |
| Base | SQLite ; migrations Alembic | domaine public ; MIT | — |
| File d'analyses | table `runs` en base, un processus worker qui la lit | — | pas de Redis : un seul poste |
| Front | React, Vite, Tailwind, TanStack Query | MIT | même pile qu'UNO League |
| Annotation | CVAT (ou Label Studio) | MIT (Apache 2.0) | hors du produit, outil de l'admin |
| Évaluation du suivi | TrackEval | MIT | — |
| Référence utile | `roboflow/sports` : radar, répartition en équipes | MIT | à lire, pas à dépendre |

Reconnaissance faciale : aucune, par décision (`09-DECISIONS.md`, D-06).

---

## 4. Budget GPU

Matériel cible : **RTX 2070 Super, 8 Go**. Verdict : **suffisant** pour
l'inférence et pour l'affinage des détecteurs retenus. Les chiffres ci-dessous
sont des **ordres de grandeur à mesurer au jalon J0** ; ils supposent une
exécution en demi-précision (FP16) sous PyTorch, sans TensorRT.

### Inférence : une session de 2 h à 30 images/s = 216 000 images

| Configuration | Débit estimé | Durée pour la session |
|---|---|---|
| personnes à 640 px, une image sur deux | 60 à 90 images/s | 20 à 30 min |
| ballon sur l'image native (720p : 1 280 px de large, soit 2 tuiles de 640 ; 1080p GoPro : 4 tuiles), une image sur deux | 20 à 30 images/s en 720p, 15 à 25 en 1080p | 1 h à 2 h |
| suivi, radar, règles, métriques (CPU) | — | 10 à 20 min |
| **total** | — | **2 à 3 h**, marge large sous les 12 h |

Si le ballon exige toutes les images (tirs rapides), le total double et
reste sous 6 h. Un suréchantillonnage ×1,5 de l'image 720p pour le ballon,
si son rappel plafonne, coûte à peu près le même surcroît. TensorRT peut
encore diviser par deux ; ce n'est pas prévu en V1.

### Affinage des détecteurs

| Modèle | Résolution | Lot | Mémoire | 2 000 images, 50 époques |
|---|---|---|---|---|
| RT-DETRv2-R18 | 640 | 8 | ~6 Go | 2 à 3 h |
| RT-DETRv2-R34 | 640 | 4 | ~7 Go | 4 à 5 h |
| RF-DETR Small | 640 | 4, accumulation 4 | ~7 Go | 3 à 4 h |

Les campagnes sont périodiques (toutes les quelques sessions), la nuit. Le
GPU local suffit. **Repli le moins cher** si une campagne dépasse le poste :
location à l'heure d'une RTX 3090 ou 4090 (Vast.ai, RunPod : de l'ordre de
0,20 à 0,50 € de l'heure, une campagne coûte un ou deux euros). Kaggle offre
30 h hebdomadaires de GPU gratuit. Ces replis supposent d'envoyer des images
de joueurs hors du poste : voir `10-RGPD.md` avant d'y recourir.

---

## 5. Modèle de données

Base SQLite, tables principales. Les volumes par image sont en Parquet
(§2) ; la base ne garde que ce qui se lit, se filtre et se corrige.

| Table | Contenu |
|---|---|
| `venues` | salle : nom, gabarit du terrain (dimensions, buts, surfaces), lien vers l'identifiant UNO League |
| `calibrations` | par salle et emplacement : paramètres de distorsion, homographie, polygones, erreur de reprojection, image de référence, date |
| `sessions` | une session analysée : date, salle, calibrage, couleurs des équipes, mode, état, lien feuille UNO League |
| `videos` | fichiers d'une session : chemin, ordre, métadonnées, chemin de la version 720p |
| `matches` | par session : ordre, équipes, vidéo et instant du coup d'envoi, fin, score déclaré, côtés |
| `participants` | effectif de la session : équipe, numéro, joueur UNO League ou invité |
| `track_identities` | piste → participant ou arbitre, par intervalle d'images, origine (désignation, proposition confirmée, automatique) |
| `events` | action : match, type, auteur, passeur, équipe, instant vidéo, horloge, confiance, preuves (JSON), état, `client_id` |
| `event_reviews` | une ligne par geste de l'admin : action, geste, original, final, date |
| `runs` | analyses : session, étapes demandées, versions (modèle, règles, calibrage), état, durées, journal |
| `model_versions` | modèles disponibles : nom, chemin des poids, jeu d'entraînement, métriques, promu ou non |
| `rule_versions` | fichiers de règles versionnés et leurs paramètres |
| `metrics` | physique et possession par participant et par match |
| `dataset_items` | images et clips retenus pour l'entraînement, avec leur origine et leur état d'annotation |
| `evaluations` | résultats d'une version sur le jeu d'or |

Clés de stabilité :

- `events.client_id` est généré **à la création** de l'action, au format
  `vis-<uuid>`, et ne change jamais, même corrigée. C'est lui qui rend
  l'export idempotent côté UNO League (`stat_events.client_id`).
- Une action rejetée n'est pas supprimée : son état devient `rejected` et
  l'export transmet sa suppression. C'est ce qui permet de la ré-admettre.

---

## 6. Organisation du dépôt `uno-league-vision`

```
uno-league-vision/
├── docs/                    cette documentation
├── vision/                  bibliothèque Python : la chaîne de traitement
│   ├── ingest/              ffprobe, ffmpeg, versions 720p
│   ├── calibrate/           distorsion, homographie, gabarits de terrain
│   ├── detect/              chargement des modèles, inférence, tuilage
│   ├── track/               ByteTrack, lissage
│   ├── identify/            terrain, équipes, arbitre, identités
│   ├── radar/               projection, vitesses
│   ├── ball/                trajectoire, possession
│   ├── rules/               les règles, une par fichier, et rules.yaml
│   ├── metrics/             agrégations
│   ├── export/              CSV, manifeste, client UNO League
│   └── pipeline.py          l'enchaînement des étapes et leurs artefacts
├── api/                     FastAPI : routes, schémas, file des analyses
├── worker/                  processus qui exécute les analyses
├── web/                     React + Vite + Tailwind
├── models/                  poids des modèles (hors git, LFS ou S3) et fiches
├── rules/                   versions du fichier de règles
├── tools/                   scripts : calibrage, export CVAT, évaluation
├── tests/
│   ├── unit/                règles sur des radars synthétiques, projection
│   ├── golden/              le jeu d'or : vidéos courtes et actions attendues
│   └── fixtures/
├── pyproject.toml
└── docker-compose.yml       api + web ; le worker tourne en natif pour le GPU
```

Les règles se testent **sans vidéo** : un radar synthétique (dix points qui
bougent, un ballon) suffit à vérifier qu'un franchissement de ligne produit
un but, qu'une récupération de 1,9 s n'est pas une défense. C'est ce qui rend
les règles modifiables sans peur.

---

## 7. Exécution

| Environnement | Mode | Remarque |
|---|---|---|
| **Windows 11, GPU local (le poste de l'admin)** | Python natif (venv), PyTorch CUDA ; `vision-api` et `vision-web` en natif aussi, une seule commande | Docker n'accède pas au GPU sans WSL2 : tout reste natif, c'est plus simple ; Docker Desktop ne sert qu'à CVAT |
| Linux, GPU local | tout en natif, ou worker natif + Docker pour le reste | — |
| CI (GitHub Actions) | tests unitaires et règles sur CPU ; licences ; types ; build du front | pas de GPU en CI : le jeu d'or s'évalue en local, résultat versionné |

Une seule commande de démarrage (`uno-vision up`) lance l'API, le worker et
sert le front sur `http://localhost:8750`. L'écoute est limitée à
`localhost` : rien n'est exposé.

Variables d'environnement : `UNO_API_URL`, `UNO_API_TOKEN`, `S3_*`
(optionnel), `VISION_DATA_DIR` (vidéos, artefacts, modèles), `VISION_DEVICE`
(`cuda:0` ou `cpu`).

---

## 8. Ce que l'architecture rend possible plus tard, sans se renier

- **Caméra mobile (V2)** : l'étape 2 produit une homographie par image au
  lieu d'une seule ; les étapes 6 à 10 ne changent pas.
- **Classificateur d'actions appris (V2)** : l'étape 8 reçoit en plus un
  modèle entraîné sur les actions validées ; les règles deviennent ses
  attributs d'entrée et son filet de sécurité.
- **Plusieurs superviseurs** : PostgreSQL, authentification, et l'API est
  déjà le seul point d'écriture.
- **Football à onze** : un gabarit de terrain de plus, des règles aux mêmes
  signatures, des seuils différents.
