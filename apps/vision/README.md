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

Ouvrez `salle.png` et relevez les coordonnées en pixels de repères dont vous
connaissez la position réelle. Sur un terrain de foot à cinq filmé depuis
derrière un but, les quatre coins sont hors champ : servez-vous des poteaux et
des coins de la surface, avec `--field-points`.

Le préréglage `--preset five-a-side` donne des dimensions de départ. Elles sont
**à confirmer une fois par centre**, mais deux choses limitent le risque. La
largeur du but, elle, est normalisée : calibrer sur les poteaux fixe l'échelle
correctement même si la longueur déclarée est approximative. Et surtout,
l'analyse relit ensuite les vitesses des joueurs : une échelle fausse s'y voit
immédiatement, parce que personne ne court à 15 m/s. L'avertissement remonte
dans `review.warnings` avant qu'aucune statistique ne soit validée.

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

### 2. Décrire l'enchaînement de la session

Une session UNO League n'est pas un match : c'est une succession de matchs de
dix minutes, et **les équipes changent à chaque fois**. Le même joueur peut
défendre pour l'équipe A au premier match et attaquer pour l'équipe B au
troisième. Chaque match est donc analysé séparément, avec sa propre feuille.

```bash
uno-vision session-template --matches 6 --minutes 10 --out session.json
```

Complétez les bornes de chaque match et, pour chacun, la composition des
équipes. Rien dans l'image ne signale ces frontières de façon fiable — le
tableau du centre continue souvent de compter sans se remettre à zéro — et
l'application connaît déjà l'enchaînement.

L'analyse produit alors un rapport par match :

```bash
uno-vision analyze --video session.mp4 --calibration salle.json \
                   --session session.json --out resultats/
```

Exemple pour une caméra derrière un but, calibrée sur la cage adverse et les
coins de sa surface :

```bash
uno-vision calibrate --preset five-a-side \
  --points "296,74 351,74 214,132 437,132" \
  --field-points "13.5,0 16.5,0 9,4 21,4" \
  --venue "Le Five Bobigny" --out salle.json
```

### 2 bis. Préparer la feuille d'un match isolé

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

### 4. Valider — 10 à 20 minutes d'arbitre

```bash
uno-vision review --report resultats/session.json
```

Ouvrez `resultats/review.html` : chaque action proposée avec son extrait de six
secondes, la feuille de match qui se recalcule en direct, et trois gestes —
<kbd>V</kbd> valider, <kbd>X</kbd> supprimer, ou attribuer à un autre joueur.
L'arbitre peut aussi **ajouter une action que la vision a manquée** : une chaîne
qui ne permet que de corriger ce qu'elle a vu produit toujours une feuille
incomplète, sans que personne s'en aperçoive.

La page est un fichier autonome, sans serveur ni réseau : les extraits vidéo
d'une session ne quittent pas la machine de celui qui valide.

Puis, avec le fichier `corrections.json` téléchargé depuis la page :

```bash
uno-vision apply-review --report resultats/session.json \
                        --corrections corrections.json
```

Les statistiques ne sont jamais retouchées à la main : elles sont **recalculées**
à partir des événements retenus. Corriger un compteur sans corriger l'événement
qui l'a produit laisserait une feuille que plus rien ne justifie.

### 5. Rejouer les règles — sans GPU, en une seconde

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

## Mesurer plutôt qu'estimer

Beaucoup de centres incrustent un tableau d'affichage dans leur vidéo. Il est
tentant d'y lire les buts — c'est facile et c'est exact. **C'est une impasse, et
le système ne le fait pas** : tous les centres ne l'affichent pas, le format
change de l'un à l'autre, et une chaîne qui en dépendrait cesserait de
fonctionner du jour au lendemain sans prévenir. Les statistiques ne viennent
jamais de là.

En revanche, là où il existe, ce tableau donne gratuitement ce qui coûte le plus
cher en vision par ordinateur : **une vérité terrain**. Savoir qu'un but a été
marqué à 20 min 04 permet de mesurer si la détection géométrique l'a vu, au lieu
d'estimer qu'elle le verrait probablement.

```bash
uno-vision reference --video session.mp4 --out repere.json    # une fois
uno-vision evaluate --report resultats/session.json --reference repere.json
```

La lecture ne suppose aucune police connue — ce qui la rend transposable d'un
centre à l'autre. Elle s'appuie sur trois propriétés que le football garantit :
le score part de zéro et passe par chaque unité (les dix premières silhouettes
vues seules sont donc les chiffres 0 à 9) ; il n'existe que dix chiffres (toute
forme nouvelle au-delà est un artefact de compression) ; un score augmente
d'exactement un (toute lecture qui saute ou recule est fausse).

Cette dernière propriété est aussi l'autocontrôle du repère : le décompte des
changements doit reconstituer le score affiché à la fin. **Sur cinq sessions de
centres différents — 55 à 89 minutes, 130 buts — les deux coïncident
exactement**, pour 60 à 100 secondes de calcul par session et sans GPU. Quand
ils divergent, le repère se déclare faux et `evaluate` refuse de s'en servir.

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

(Plan large seul, sans recherche par tuiles — voir plus bas.)

Le clip le moins défini obtient le meilleur taux : à Thiais l'action se déroule
au premier plan, à Clermont elle est souvent à l'autre bout du terrain. C'est la
taille du ballon **en pixels** qui compte, pas celle de l'image. Les positions
retenues ont été vérifiées à l'œil sur des images annotées : ce sont bien les
vrais ballons.

C'est aussi ce qui explique le seul réglage qui change vraiment la donne. Sur le
clip difficile, à découpage identique :

| Analyse du ballon | Images avec ballon |
|---|---|
| Plan large à sa résolution native | 48 % |
| Tuiles de 640 px analysées à 640 px | 40 % — soit rien, pour six fois le calcul |
| **Tuiles de 640 px analysées à 1280 px** | **77 %** |

Le découpage ne sert à rien par lui-même : une tuile analysée à sa propre taille
laisse le ballon exactement aussi petit qu'avant. Tout le gain vient de
l'agrandissement, qui double la taille du ballon dans l'entrée du réseau. C'est
désormais le comportement par défaut, et la configuration sans agrandissement
est refusée plutôt que payée silencieusement.

**4. Les identités tiennent, sur la durée d'un extrait.** Le suivi produit
21 identités pour une douzaine de personnes sur 23 s à Thiais, dont 13 tiennent
plus de la moitié du clip et plusieurs la totalité. Sur un match de vingt
minutes la fragmentation s'accumulera nécessairement — c'est précisément le
rôle des dossards numérotés, qui rattachent une nouvelle piste au bon joueur.

Deux autres constats, corrigés dans le code : les caméras d'arène sont
**recadrées**, donc leur centre optique n'est pas au milieu de l'image — le
libérer fait tomber le résidu de calibration d'un facteur neuf, mais exige
plusieurs lignes de contrôle sous peine de surajustement ; et les salles sont
pleines de **spectateurs** derrière la balustrade, que le détecteur voit comme
des joueurs — les projections hors du terrain sont désormais écartées.

## Fiabilité attendue

Estimations pour une caméra fixe en 1080p et des chasubles numérotées, avant
tout affinage sur vos propres vidéos :

Le facteur limitant mesuré est le ballon, pas les joueurs.

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
| Recherche du ballon par tuiles | jusqu'à 6 inférences de plus par image, ramenées à une seule tant que le ballon reste suivi |
| GPU (T4/A10, ~0,30 €/h) | quelques dizaines de centimes par session |
| Extraits vidéo | quelques minutes de CPU |
| Rejouer les règles (`replay`) | gratuit, une seconde, sans GPU |

Réduire le coût : `--stride 2` divise le temps par deux (au prix de la précision
des tirs), et `--no-bibs` économise l'OCR quand les numéros sont illisibles. En
revanche, désactiver la recherche par tuiles fait tomber le taux de détection du
ballon de 77 % à 48 % sur une action lointaine : c'est la dernière économie à
envisager.

---

## Suite prévue

1. **Calibrer un centre** et faire tourner `analyze` sur une session complète,
   puis `evaluate` contre le repère. C'est la première mesure de bout en bout du
   taux de détection des buts, et elle ne demande aucune annotation manuelle.
2. **Étalonner les seuils** avec `replay` sur les sessions déjà analysées.
3. **Écran de validation dans l'application** : la liste des événements avec
   leur extrait, un bouton pour valider ou corriger, puis l'écriture dans
   `match_stats` par la route de validation existante. Budget visé : 10 à
   20 minutes d'arbitre pour une session de 90 minutes.
4. **Affiner le détecteur** sur des images des centres partenaires — c'est ce
   qui fait le plus progresser le taux de détection du ballon, facteur limitant.
5. **Boucle d'amélioration** : chaque correction d'arbitre devient un exemple
   annoté, gratuitement.

Les chasubles numérotées n'existent pas encore sur les vidéos d'essai, qui sont
du contenu existant des centres. Le système est écrit pour elles et fonctionne
sans, en dégradé : sans numéro lisible, un événement part dans
`review.unassignedEvents` au lieu d'être attribué. C'est la différence entre
corriger une feuille et la saisir.

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
