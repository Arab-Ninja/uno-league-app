# Données et entraînement

Deux choses s'apprennent, à deux niveaux différents :

| Niveau | Ce qui apprend | De quoi | Signal |
|---|---|---|---|
| **Perception** | les détecteurs (personnes, ballon) | d'images annotées avec des boîtes | l'annotation dans CVAT, guidée par les images où le modèle a douté |
| **Déduction** | les seuils des règles ; en V2, un classificateur | des actions revues | chaque geste de revue de l'admin |

Le second niveau ne coûte rien à produire : il est la supervision
elle-même. Le premier demande un travail d'annotation, borné et outillé.

---

## 1. Sources de données

| Source | Rôle | Attention |
|---|---|---|
| vidéos de centres five similaires (vue de coin, fish-eye) | amorcer la perception : joueurs, ballon, calibrage ; **pas** d'équipes par couleur (pas de chasubles) | domaine proche mais pas identique : évaluer toujours sur nos salles |
| premières sessions UNO League réelles | le domaine cible, chasubles et numéros compris | les revoir entièrement : elles font le jeu d'or |
| radars synthétiques | tester les règles sans vidéo | ne mesurent rien sur le réel |

**Séparation stricte** : une image ou une action du jeu d'évaluation ne vient
jamais d'un match présent dans le jeu d'entraînement. Au moins une salle est
tenue hors de l'entraînement pour mesurer la généralisation.

---

## 2. Annotation pour la perception

### Classes

| Classe | Définition |
|---|---|
| `person` | toute personne, sur le terrain ou non ; la boîte englobe le corps entier |
| `ball` | le ballon, même partiellement visible ou flou ; boîte serrée |

Pas de classe « arbitre » ni « gardien » : ce sont des rôles, déduits par
les règles. Une classe `referee` pourra s'ajouter si la tenue ne suffit pas.

### Combien

| Étape | Images annotées | Objectif |
|---|---|---|
| amorce | 300, sur les vidéos de centres similaires | un premier modèle qui tourne sur nos salles |
| première campagne | 1 000 à 1 500, dont la moitié de nos salles | VIS-PER-001, VIS-BAL-001 |
| régime de croisière | 100 à 200 par mois, choisies par le système | corriger ce qui se dégrade |

Une image d'une scène de futsal porte dix à quinze boîtes : 1 500 images,
c'est de l'ordre de 20 000 boîtes. **Avec pré-annotation par le modèle
courant**, l'admin corrige au lieu de dessiner : 30 à 60 s par image, soit
une quinzaine d'heures pour la première campagne, étalées.

### Quelles images

Le système les choisit (VIS-SUP §6) : les images où le ballon est perdu alors
que des joueurs sont groupés, celles où une détection est faible, celles
d'une reprise de piste, et un tirage uniforme pour ne pas sur-représenter
les cas difficiles. Toutes les salles, toutes les positions sur le terrain,
les deux bouts du terrain (le fond, où les silhouettes sont petites).

### Outil

**CVAT**, en local via Docker : import des images et des pré-annotations au
format COCO, export COCO, pris en charge par les entraîneurs RT-DETR et
RF-DETR. Label Studio convient aussi. Les deux sont libres (MIT, Apache 2.0).

---

## 3. Affiner un détecteur

Recette de référence sur la RTX 2070 Super, à ajuster à l'essai :

| | Personnes | Ballon |
|---|---|---|
| modèle de départ | RT-DETRv2-R18, poids COCO | le même, ou un second modèle dédié |
| résolution d'entrée | 640 | 1 280, ou tuiles de 640 avec recouvrement |
| lot | 8 | 4 |
| précision mixte | oui | oui |
| époques | 50, arrêt anticipé sur la validation | 80 |
| augmentation | recadrage, couleur, flou de mouvement ; **pas** de retournement vertical | idem, plus mosaïque |
| durée estimée | 2 à 3 h | 3 à 5 h |

Un seul modèle à deux classes est le point de départ ; un modèle séparé pour
le ballon se justifie si son rappel plafonne (le ballon est petit et rare, la
classe `person` domine la perte).

Les poids, le jeu de données utilisé, les hyperparamètres et les métriques
sont écrits dans une **fiche de modèle** (`models/<nom>/<version>/card.json`).
Un modèle n'est utilisable par le pipeline que s'il a une fiche.

---

## 4. Métriques

### Perception

| Métrique | Sur quoi | Cible après la première campagne |
|---|---|---|
| mAP@50 `person` | images de nos salles, hors entraînement | ≥ 0,90 |
| rappel `person` à 25 px de haut | idem, silhouettes du fond | ≥ 0,85 |
| mAP@50 `ball` | idem | ≥ 0,60 |
| rappel `ball` (images où il est visible) | idem | ≥ 0,70 |

### Suivi

Trois extraits de deux minutes, annotés avec des identités (CVAT le permet),
évalués avec TrackEval :

| Métrique | Cible |
|---|---|
| IDF1 | ≥ 0,75 |
| HOTA | ≥ 0,60 |
| changements d'identité par match de 10 min | ≤ 5 (VIS-PER-002) |

### Actions

Une action proposée **correspond** à une action de référence si : même
type, même auteur, et écart d'horloge ≤ 3 s (5 s pour un but, dont l'instant
exact est flou). Les correspondances se font par match, au plus une par
action.

| Métrique | Définition |
|---|---|
| **précision** | correspondances ÷ proposées |
| **rappel** | correspondances ÷ référence |
| **F1** | moyenne harmonique des deux |
| **taux d'accord** | validées telles quelles ÷ revues (ce que l'admin ressent) |
| **matrice de confusion** | type proposé × type final, les rejets dans une colonne « rien » |
| **erreur d'instant** | médiane de l'écart d'horloge sur les correspondances |

La **référence** est l'ensemble des actions finales d'une session
entièrement revue : validées, corrigées (dans leur version finale), ajoutées.

Cibles indicatives à la fin de la première campagne, sur le jeu d'or :

| Type | Précision | Rappel |
|---|---|---|
| but | ≥ 0,90 | ≥ 0,90 |
| passe décisive | ≥ 0,80 | ≥ 0,75 |
| tir cadré | ≥ 0,75 | ≥ 0,70 |
| arrêt | ≥ 0,70 | ≥ 0,65 |
| défense | ≥ 0,60 | ≥ 0,50 |
| entre au but | ≥ 0,90 | ≥ 0,90 |

Et deux indicateurs produit : **temps de revue par match** (cible 15 min
puis 5) et **part des actions revues sous le seuil de confiance** (pour
décider un jour de ne plus tout revoir).

### Physique

Une course chronométrée sur une distance mesurée, par salle, à chaque
calibrage : erreur sur la vitesse moyenne ≤ 15 % (VIS-PHY-005). Si un joueur
porte une montre GPS, sa distance de session sert de second point de
comparaison, en sachant que le GPS en salle est lui-même approximatif.

---

## 5. Le jeu d'or

Au moins **cinq matchs** entièrement revus, sur **deux salles**, dont un
avec changement de gardien et un avec but contre son camp s'ils existent.
Figés : on n'y ajoute qu'en versionnant.

Toute version de modèle ou de règles est évaluée sur le jeu d'or **avant**
d'être promue. Le rapport compare à la version promue, type par type. Règle
de promotion : aucune baisse de plus de 2 points de précision sur les buts,
amélioration du F1 moyen pondéré. Le rapport est versionné dans le dépôt
(`evaluations/<version>.json`) : l'historique de l'IA se lit dans git.

Le jeu d'or sert aussi de **test de régression** en CI, sur CPU, en version
réduite : les radars des matchs du jeu d'or sont stockés (Parquet), et les
règles sont rejouées dessus à chaque modification ; les actions attendues
sont comparées. Cela ne teste pas la perception, qui demande le GPU, mais
tout le reste.

---

## 6. Apprendre les règles

Après chaque session revue, l'outil `tools/tune_rules.py` :

1. charge les radars et les actions finales de toutes les sessions revues ;
2. pour chaque paramètre, parcourt une grille autour de sa valeur courante ;
3. retient, type par type, la combinaison qui maximise le F1, sous contrainte
   que la précision des buts ne baisse pas ;
4. écrit `rules/<version>.yaml` et son rapport.

La nouvelle version suit le même chemin de promotion qu'un modèle. Les
seuils ne sont pas ajustés à chaque session — ce serait courir après le
bruit — mais par campagne, quand quelques sessions se sont accumulées.

---

## 7. Versionnage

| Objet | Où | Identifiant |
|---|---|---|
| modèle | `models/<nom>/<version>/` : poids, `card.json` | `<nom>-v<n>` |
| règles | `rules/<version>.yaml` | `AAAA.MM-<lettre>` |
| calibrage | base, table `calibrations` | entier, salle et date |
| pipeline | version du paquet Python | semver |
| évaluation | `evaluations/<objet>-<version>.json` | — |

Chaque analyse enregistre les quatre premiers ; chaque action exportée les
porte dans le manifeste. Reproduire une analyse, c'est rejouer avec les mêmes
versions (VIS-QUA-003).

Les poids des modèles ne vont pas dans git : stockage S3 (préfixe
`vision/models/`) ou Git LFS, au choix ; la fiche, elle, est versionnée.

---

## 8. Quand le GPU local ne suffit plus

Il suffit pour tout ce qui est décrit ici. Deux cas le dépasseraient : un
modèle plus gros (RT-DETR-R50, RF-DETR Large) ou un jeu de données de
plusieurs dizaines de milliers d'images. Alors, une campagne se loue à
l'heure (voir `02-ARCHITECTURE.md` §4), en n'envoyant que les images
annotées, jamais les vidéos, et en respectant `10-RGPD.md` §4.
