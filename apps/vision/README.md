# UNO Vision

Analyse automatique des vidéos de sessions UNO League : reconnaissance du
terrain, des joueurs et du ballon, séparation des équipes, et proposition des
quatre statistiques du classement — **buts, passes décisives, défenses
réussies, arrêts du gardien**.

Le système **propose**, l'arbitre **valide**. Aucune statistique n'entre en base
sans validation humaine : c'est ce qui permet de s'en servir dès la première
session, sans attendre d'avoir un modèle parfait.

---

## Ce que fait le système, et ce qu'il ne fait pas

| Il sait faire | Il ne sait pas faire |
|---|---|
| Situer les joueurs et le ballon sur le terrain, en mètres | Deviner qui est qui sans dossards ni calibration |
| Séparer les deux équipes par la couleur des chasubles | Distinguer deux équipes habillées pareil |
| Détecter les buts, y compris contre son camp | Juger un hors-jeu ou une faute |
| Attribuer buteur et passeur | Trancher une mêlée de six joueurs à un mètre |
| Reconnaître arrêts du gardien et défenses | Lire l'intention d'un joueur |
| Produire un extrait vidéo par événement | Remplacer l'arbitre |

Le principe est constant : **un événement se déduit d'une géométrie, jamais
d'une apparence**. Un but, c'est un ballon dont la position au sol franchit la
ligne entre les poteaux — pas « une image qui ressemble à un but ». Cette
approche s'explique à un arbitre, et surtout elle ne demande **aucune donnée
d'entraînement propre à UNO League** pour démarrer.

Sa limite doit être connue : la projection suppose le ballon **au sol**. Un
ballon aérien est projeté trop loin, et une frappe passée au-dessus de la barre
peut se lire comme un but. D'où le score de confiance, l'extrait vidéo joint, et
la validation par l'arbitre.

---

## Protocole de tournage

C'est la partie la plus rentable du projet. Une heure passée à bien installer la
caméra vaut mieux que trois semaines d'amélioration des modèles.

**Caméra fixe, plan large, immobile.** Trépied ou fixation murale. La caméra ne
bouge pas, ne zoome pas, ne suit pas le ballon.

| Réglage | Recommandé | Minimum |
|---|---|---|
| Position | à mi-longueur du terrain, au-dessus des têtes | de côté, pas derrière un but |
| Hauteur | 4 à 6 m | 2,5 m |
| Cadrage | les quatre coins du terrain visibles en permanence | les deux buts visibles |
| Résolution | 1080p | 720p |
| Images/seconde | 30 | 25 |
| Exposition | fixe, pas d'auto-exposition | — |

Trois erreurs coûtent cher :

1. **déplacer la caméra entre deux matchs** — la calibration devient fausse et
   toutes les distances avec elle. Si la caméra bouge, refaites la calibration ;
2. **filmer derrière un but** — les joueurs se cachent les uns les autres et la
   profondeur devient illisible ;
3. **l'auto-exposition** — la couleur des chasubles change quand un joueur passe
   sous un projecteur, et la séparation des équipes se met à osciller.

**Objectif grand-angle.** Les caméras d'arène déforment fortement : un mur
rectiligne y devient un arc. Une homographie transporte les droites en droites —
lui donner des points courbés fausse les distances, et d'autant plus qu'on
s'éloigne du centre de l'image, c'est-à-dire là où se jouent les buts. La
correction se calibre une fois par salle, en même temps que le terrain
(voir `calibrate --lens-lines`).

**Chasubles.** Deux couleurs franchement différentes (rouge vif contre bleu vif,
pas orange contre rouge), numéros de **20 cm au minimum**, dans le dos et sur la
poitrine. C'est le numéro qui relie un joueur à son `playerId` : sans lui, les
statistiques sont anonymes.

---

## Installation

Le cœur du paquet n'a aucune dépendance. Seule l'analyse d'une vraie vidéo
demande la pile lourde.

```bash
cd apps/vision
python -m venv .venv && source .venv/bin/activate

pip install -e .                          # cœur seul : règles, tests, replay
pip install -e ".[video,detect,ocr]"      # analyse vidéo complète
pip install -e ".[dev]"                   # tests
```

`ffmpeg` doit être installé pour produire les extraits (`apt install ffmpeg`).

Sur GPU loué (RunPod, Vast.ai, Modal), partez d'une image PyTorch CUDA récente ;
la première exécution télécharge les poids YOLO (~50 Mo) et EasyOCR (~100 Mo).

---

## Utilisation

### 1. Calibrer la salle — une seule fois

```bash
uno-vision frame --video match.mp4 --out salle.png --at 0
```

Ouvrez `salle.png`, relevez les coordonnées en pixels des quatre coins du
terrain, dans cet ordre : **but gauche côté proche, but droit côté proche, but
droit côté loin, but gauche côté loin**. Mesurez le terrain au décamètre.

Si les murs paraissent courbés sur l'image — c'est le cas de toutes les caméras
d'arène —, relevez aussi une dizaine de points le long de **deux ou trois
droites réelles** de la salle, d'orientations différentes : le bas d'un mur, une
ligne de surface, un montant vertical.

```bash
uno-vision calibrate \
  --points "310,880 1620,880 1450,410 480,410" \
  --lens-lines "120,300 250,270 400,255 550,250 700,255 850,270 ; \
                200,880 200,700 200,540 200,420" \
  --optical-center --image-size 1280x720 \
  --length 38 --width 18 --venue "Gymnase Léo-Lagrange" \
  --out salle.json
```

La commande affiche deux contrôles : de combien la courbure des lignes a été
réduite, et où tombe le rond central. Si ce point n'est pas au centre du terrain
sur votre image, un coin a été mal relevé.

`--optical-center` cherche aussi le centre optique, souvent décalé sur les
caméras d'arène recadrées. Il exige au moins deux lignes d'orientations
différentes, et refuse sinon : avec une seule direction et trois paramètres
libres, la correction s'ajuste parfaitement aux points fournis et se trompe
partout ailleurs.

Cette calibration reste valable pour **toutes** les sessions filmées depuis le
même trépied.

### 2. Préparer la feuille de match — une fois par match

```bash
uno-vision roster-template --out match.json
```

Complétez les `playerId` (ceux de la base UNO League), les numéros de dossards
distribués, les couleurs de chasubles et le gardien de chaque équipe.

### 3. Analyser — le seul moment qui consomme du GPU

```bash
uno-vision analyze \
  --video match.mp4 --calibration salle.json --roster match.json \
  --out resultats/ --device cuda:0
```

Produit `resultats/report.json`, `resultats/observations.jsonl` et un extrait
vidéo par événement dans `resultats/clips/`.

### 4. Rejouer les règles — sans GPU, en une seconde

```bash
uno-vision replay \
  --observations resultats/observations.jsonl \
  --calibration salle.json --roster match.json --out resultats2/
```

C'est la commande à utiliser pour étalonner les seuils. La vidéo n'est décodée
qu'une fois ; les règles se retravaillent ensuite sur des dizaines de matchs
déjà analysés, sur un ordinateur portable.

---

## Le rapport produit

```jsonc
{
  "schemaVersion": 1,
  "match": { "proposalId": 42, "scoreA": 3, "scoreB": 2 },
  "events": [
    {
      "id": "0003-goal-000742000",
      "kind": "goal",
      "timeMs": 742000,
      "bib": 7, "playerId": 118, "playerName": "Yassine",
      "confidence": 0.91,
      "needsReview": false,
      "detail": "Ballon franchissant la ligne du but right 0.4 s après le dernier contact.",
      "clip": "resultats/clips/0003-goal-000742000.mp4"
    }
  ],
  "matchStats": [
    { "playerId": 118, "bib": 7, "goals": 2, "assists": 1, "defenses": 0, "saves": 0 }
  ],
  "review": { "unassignedEvents": [], "lowConfidenceEvents": ["0007-save-001120000"], "warnings": [] },
  "quality": { "ballDetectionRate": 0.78, "shots": 24, "shotsOnTarget": 11 }
}
```

`matchStats` a **exactement** la forme de la table `match_stats` de l'API. La
vision ne crée pas de modèle de données parallèle : elle remplit celui qui
existe. Le barème du classement (`packages/shared/src/ranking.ts`) reste la
seule autorité sur ce que valent ces quatre nombres.

Trois champs pilotent la relecture par l'arbitre :

* `confidence` — de 0 à 1, la solidité de la déduction ;
* `needsReview` — vrai si le joueur est inconnu ou la confiance faible ;
* `clip` — les six secondes de vidéo qui montrent l'action.

---

## Comment ça marche

```
vidéo ─┬─► détection (YOLO) ─► suivi ─┬─► couleur du buste ─► équipe
       │                              └─► OCR du dossard ──► joueur
       └─► homographie ──────────────────► positions en mètres
                                                │
                                   observations.jsonl  ◄── le cache
                                                │
                    possessions ─► vols du ballon ─► tirs
                                                │
              buts · passes décisives · arrêts · défenses
                                                │
                                    rapport + extraits vidéo
```

Le paquet est coupé en deux moitiés qui ne partagent aucune dépendance :

* la **perception** (`uno_vision.video`) décode, détecte, lit les dossards —
  elle seule réclame OpenCV, Ultralytics et un GPU ;
* le **raisonnement** (tout le reste) transforme des positions en faits de jeu,
  en Python pur, testé et exécutable partout.

Elles communiquent par un fichier d'observations. C'est ce découpage qui rend
les règles testables en intégration continue, sans GPU et sans vidéo.

### Les règles, en clair

| Statistique | Règle appliquée |
|---|---|
| **But** | Le ballon franchit la ligne entre les poteaux. Le buteur est le dernier porteur dans les 8 s. Si c'est un défenseur de ce but : contre son camp, crédité à personne. |
| **Passe décisive** | Possession du coéquipier juste avant le but, sans touche adverse entre les deux, et si le buteur n'a pas gardé le ballon plus de 4 s. |
| **Arrêt** | Tir cadré interrompu par le gardien adverse — ballon bloqué, ou trajectoire cassée près de lui (le ballon repoussé du poing ne devient jamais une possession). |
| **Défense** | Tir cadré contré par un joueur de champ sur l'axe de frappe, ou ballon récupéré **dans son tiers défensif** alors que l'adversaire progressait vers le but. |

La restriction de la défense au tiers défensif est essentielle : sans elle,
chaque perte de balle au milieu deviendrait une « défense réussie » et la
statistique mesurerait les passes ratées de l'adversaire, pas le mérite du
défenseur.

Tous les seuils sont dans `src/uno_vision/config.py` et surchargeables par un
fichier JSON (`--config`).

---

## Ce que de vraies images ont appris

Le système a été confronté à six extraits de salles de foot à cinq (caméra fixe
grand-angle au-dessus d'un but, 25 im/s, 406p à 720p, 19 à 34 s). Trois
enseignements, tous devenus du code :

**1. Les joueurs se détectent très bien, dès le modèle générique.** Environ
10 à 12 détections fiables par image, y compris les joueurs les plus éloignés,
sans aucun affinage. Ce n'était pas le point difficile.

**2. Le ballon n'est presque jamais le mieux noté.** Sur une image mesurée, le
vrai ballon sort à **0,10** de confiance quand les marquages blancs peints sur
le gazon sortent à **0,19 et 0,33**. Suivre la meilleure note revient à suivre
le décor. Deux propriétés les séparent, et aucune n'est une question
d'apparence : le décor ne bouge pas de tout le clip, et le ballon ne saute pas
d'un bout du terrain à l'autre entre deux images. D'où le choix du ballon en
seconde passe, une fois le clip entier observé — trois faux ballons fixes
identifiés et écartés sur chacun des clips analysés.

**3. Le taux de détection du ballon dépend surtout de sa distance.**

| Clip | Résolution | Images avec ballon | Plus longue séquence |
|---|---|---|---|
| Stadium-Thiais | 722×406 | **82 %** | 8,9 s |
| ClermontFootFive | 1280×720 | **47 %** | 1,3 s |

Le clip le moins défini obtient le meilleur taux : à Thiais l'action se déroule
au premier plan, à Clermont elle est souvent à l'autre bout du terrain. C'est la
taille du ballon **en pixels** qui compte, pas celle de l'image. Les positions
retenues ont été vérifiées à l'œil sur des images annotées : ce sont bien les
vrais ballons.

Deux autres constats, corrigés dans le code : les caméras d'arène sont
**recadrées**, donc leur centre optique n'est pas au milieu de l'image — le
libérer fait tomber le résidu de calibration d'un facteur neuf, mais exige
plusieurs lignes de contrôle sous peine de surajustement ; et les salles sont
pleines de **spectateurs** derrière la balustrade, que le détecteur voit comme
des joueurs — les projections hors du terrain sont désormais écartées.

## Fiabilité attendue

Estimations pour une caméra fixe en 1080p et des chasubles numérotées, avant
tout affinage sur vos propres vidéos :

| Statistique | Attendu | Ce qui la limite |
|---|---|---|
| Score (buts par équipe) | **élevé** | ballon aérien mal projeté |
| Buteur | **bon** | mêlées devant le but, dossard illisible |
| Passe décisive | **moyen** | déviations et passes involontaires |
| Arrêt du gardien | **moyen** | ballon repoussé, gardien hors de sa surface |
| Défense réussie | **le plus faible** | la notion elle-même est floue |

C'est exactement pour cela que la première version est un assistant validé :
l'arbitre corrige en deux minutes ce que la vision propose, au lieu de tout
saisir. Et **chaque correction est une donnée d'entraînement** pour la suite.

Le premier chiffre à regarder est `quality.ballDetectionRate` : en dessous de
0,5, le ballon est trop souvent perdu et tout le reste s'en ressent — le
problème est au tournage, pas dans les règles.

---

## Coût d'exploitation

Pour une session de 90 minutes de vidéo, sur un GPU loué à l'heure :

| Poste | Ordre de grandeur |
|---|---|
| Détection + suivi + OCR | 1 à 3 min de calcul par minute de vidéo |
| GPU (T4/A10, ~0,30 €/h) | quelques dizaines de centimes par session |
| Extraits vidéo | quelques minutes de CPU |
| Rejouer les règles (`replay`) | gratuit, une seconde, sans GPU |

Réduire le coût : `--stride 2` divise le temps par deux (au prix de la précision
des tirs), et `--no-bibs` économise l'OCR quand les numéros sont illisibles.

---

## Suite prévue

1. **Filmer 3 à 5 sessions** avec le protocole ci-dessus et lancer `analyze`
   dessus. C'est la seule façon de mesurer la fiabilité réelle plutôt que de
   l'estimer.
2. **Étalonner les seuils** avec `replay` sur ces sessions.
3. **Écran de validation dans l'application** : la liste des événements avec
   leur extrait, un bouton pour valider ou corriger, puis l'écriture dans
   `match_stats` par la route de validation existante.
4. **Affiner le détecteur** sur des images de vos salles — c'est ce qui fait le
   plus progresser le taux de détection du ballon, le facteur limitant.
5. **Boucle d'amélioration** : chaque correction d'arbitre devient un exemple
   annoté, gratuitement.

---

## Développement

```bash
pip install -e ".[dev]"
pytest                    # 96 tests, aucun GPU, aucune vidéo
```

Les tests fabriquent des matchs synthétiques (`tests/synthetic.py`) : on écrit
une action — « le 2 sert le 4, qui frappe » — et on vérifie l'événement produit.
C'est ce qui permet de tester la règle indépendamment de la qualité du
détecteur, et de garder l'ensemble vérifiable en intégration continue.
