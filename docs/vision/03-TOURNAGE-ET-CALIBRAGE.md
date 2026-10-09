# Tournage et calibrage

Tout ce que le radar sait, il le tient de l'image. Dix minutes passées à bien
placer une caméra valent des semaines d'entraînement de modèle. Ce document
fixe comment filmer et comment, une fois par salle, apprendre au système où
est le terrain.

---

## 1. Les deux montages de la V1

### A. La caméra fixe du centre

Les centres five disposent de caméras grand angle (« fish-eye »), en hauteur,
dans un coin. C'est le montage **par défaut** : rien à installer, le point de
vue ne change jamais, le calibrage se fait une fois pour toutes.

Ce qu'il faut obtenir du centre :

| Élément | Minimum | Préférable |
|---|---|---|
| Résolution | 1280 × 720 (**ce que livrent les centres**) | 1920 × 1080 ou plus |
| Cadence | 25 images/s constante | 30 |
| Format | MP4 (H.264), un fichier par créneau, remis en fichier ou par adresse URL | — |
| Image | brute (déformée), **pas** la vue « redressée » du logiciel du centre | — |
| Horodatage | heure de début du fichier | — |

**Image brute plutôt que redressée** : le redressement du centre est inconnu
et parfois variable ; le nôtre est calibré et reproductible. Si seule la vue
redressée est disponible, elle convient aussi, à condition qu'elle ne change
pas d'un jour à l'autre.

**Ce qui manque** : une caméra de coin ne voit pas tout. Sur les caméras
des centres, c'est **le coin situé sous la caméra elle-même** qui échappe à
l'image : l'objectif ne regarde pas à ses pieds. On le déclare comme **zone
aveugle** au calibrage ; les actions qui s'y déroulent sont marquées et
revues avec plus d'attention.

Ce coin touche la ligne de but du côté de la caméra. Si une partie de ce but
ou de sa zone de filet est hors champ, le signal *filet* de la règle de but
n'existe pas pour ce but : il repose sur le signal *engagement* seul, et sa
confiance est abaissée par construction (`04-REGLES-DE-DEDUCTION.md` §5).
C'est un fait à constater au calibrage, salle par salle, et une raison de
préférer la GoPro (montage B) dans une salle où ce but serait trop masqué.

**720p** : au fond du terrain, un joueur fait une vingtaine de pixels de
haut et le ballon cinq. C'est suffisant pour les personnes, limite pour le
ballon : c'est la première raison d'affiner le détecteur sur ces caméras,
et la seconde raison de garder la GoPro à 1080p comme montage de secours.

### B. La GoPro sur trépied

Montage de secours, ou pour une salle sans caméra. Les terrains sont fermés
par un filet : la caméra se place **contre le filet, à la ligne médiane, le
plus haut possible** (perche ou trépied déployé, idéalement plus de 2,5 m).

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Résolution, cadence | 1080p à 30 ou 60 images/s | 60 aide le ballon sur les tirs ; le fichier double |
| Champ de vision | **Linéaire** (ou « Linear + Horizon Lock ») si tout le terrain tient ; sinon **Large** | le mode linéaire corrige la déformation dans la caméra et simplifie le calibrage |
| Stabilisation | activée, trépied immobile | elle recadre légèrement : calibrer *avec* le réglage de la session |
| Exposition | verrouillée | une exposition variable change les couleurs des chasubles |
| Balance des blancs | fixe (intérieur) | idem |
| Découpage | laisser la caméra découper en fichiers de 4 Go | l'ingestion les enchaîne |

Le filet est traversé si l'objectif est **collé** aux mailles : à quelques
centimètres, il apparaît en voile flou sur toute l'image. Le mieux : filmer
par-dessus le filet quand sa hauteur le permet.

Une caméra au niveau du sol sur la ligne médiane ne voit pas un joueur caché
derrière un autre : plus elle est haute, moins les joueurs se masquent.
C'est le facteur qui compte le plus pour le suivi.

### C. Caméra tenue à la main — V2

Non couverte en V1 : le calibrage change à chaque image et demande un modèle
de détection des lignes du terrain. L'architecture le prévoit (étape 2
remplaçable), la documentation d'exploitation ne le promet pas.

---

## 2. Le gabarit de terrain

Le terrain est décrit par des paramètres, dans le repère suivant :

```
   (0,0) ┌───────────────────────────────┐ (L,0)
         │                │              │
    but  │  ╭──╮          │          ╭──╮│  but
   équipe│  │  │        ( ○ )        │  ││ équipe
   côté  │  ╰──╯          │          ╰──╯│ côté
   gauche│                │              │ droit
   (0,W) └───────────────────────────────┘ (L,W)
```

| Paramètre | Défaut (futsal) | Note |
|---|---|---|
| longueur `L` | 25 à 42 m (saisir la mesure) | les terrains de centre five sont souvent entre 25 et 32 m |
| largeur `W` | 16 à 25 m | souvent 15 à 18 m |
| largeur du but | 3,00 m | certains centres : 4,00 m |
| surface de réparation | deux quarts de cercle de 6 m reliés par un segment de 3,16 m | parfois une demi-lune simple, mesurer |
| rond central | rayon 3 m | — |
| points de réparation | 6 m et 10 m | — |
| ligne médiane | `L / 2` | — |

**Mesurer plutôt qu'estimer** : un décamètre, deux minutes, une fois. Toute
erreur de dimension se reporte en proportion sur les vitesses et les
distances. Faute de mesure, l'estimation à partir des lignes connues
(surface de 6 m, rond de 3 m) fonctionne ; l'erreur résiduelle est alors de
l'ordre de 5 %.

---

## 3. Calibrer une salle

Une fois par salle et par emplacement de caméra. Dix minutes. L'écran
**Salles → Calibrage** guide les quatre étapes.

**Étape 1 — Corriger la déformation.**
Pour une caméra fish-eye, le système estime les paramètres de distorsion à
partir des lignes du terrain, qui doivent devenir droites. Il suffit de
tracer trois ou quatre lignes connues pour droites (lignes de touche, de but,
médiane) sur une image ; l'outil ajuste et affiche l'image redressée. Pour
une GoPro en mode linéaire, cette étape est sautée.

**Étape 2 — Pointer les repères.**
Sur l'image redressée, cliquer au moins **six points** parmi ceux que le
gabarit propose : les quatre coins, les intersections de la médiane avec les
touches, les points où les surfaces touchent la ligne de but, le centre.
Plus les points sont répartis sur tout le terrain, meilleure est l'estimation.
Les points dans la zone aveugle sont simplement omis.

**Étape 3 — Vérifier.**
L'outil calcule l'homographie, redessine le gabarit sur l'image, et affiche
l'**erreur de reprojection** par point. Objectif : moyenne inférieure à
0,30 m, aucun point au-dessus de 0,60 m. Un point faux se voit immédiatement
et se redéplace.

**Étape 4 — Déclarer le terrain et la zone aveugle.**
Le polygone du terrain est déduit du gabarit ; l'admin y ajoute une marge
(0,5 m) pour les joueurs qui mordent la ligne. La zone aveugle se dessine
sur le gabarit en vue de dessus : tout ce que la caméra ne voit pas, ou voit
trop petit pour être fiable.

Le calibrage est enregistré avec l'image de référence. À chaque nouvelle
session dans la salle, le système compare les lignes du terrain à cette
référence ; un écart signale que la caméra a bougé (VIS-TER-004).

**Les côtés.** Pour chaque match, l'admin indique quel but chaque équipe
attaque au coup d'envoi (le système le propose d'après la position des
gardiens dans les trente premières secondes). Les matchs UNO League durent
dix minutes sans changement de côté ; si un changement survient, il se
déclare comme un coup d'envoi.

---

## 4. Avant chaque session : la liste

| | Vérification |
|---|---|
| ☐ | la caméra est au même emplacement qu'au calibrage, ou un nouveau calibrage est prévu |
| ☐ | l'objectif est propre, le filet n'est pas devant |
| ☐ | trois couleurs de chasubles, distinctes entre elles, du sol et de la tenue de l'arbitre |
| ☐ | les numéros sont portés devant **et** derrière, de 1 à 5 par équipe |
| ☐ | l'arbitre porte une couleur qui n'est aucune des trois |
| ☐ | l'enregistrement démarre avant le premier coup d'envoi et couvre la session entière |
| ☐ | l'admin note les couleurs par équipe et l'ordre des matchs (ou les retrouvera à la revue) |
| ☐ | le score relevé au tableau par match, pour le contrôle |

Les couleurs comptent plus que tout le reste. Deux chasubles proches (rouge
et orange, bleu et violet) sont la première cause d'erreur d'équipe, et une
erreur d'équipe fausse toutes les actions d'un joueur. Le trio **rouge,
bleu, jaune** ou **rouge, bleu, vert** est sûr sur un sol vert ou gris.

---

## 5. Précision attendue selon le montage

| | Caméra de coin (fish-eye) | GoPro ligne médiane, haute |
|---|---|---|
| Position près de la caméra | ± 0,2 m | ± 0,2 m |
| Position au fond du terrain | ± 0,6 m à 1 m | ± 0,4 m |
| Vitesse max (sprint) | ± 10 à 15 % | ± 8 à 12 % |
| Ballon en vol loin de la caméra | souvent perdu (5 px en 720p) | parfois perdu |
| Joueurs qui se masquent | rare (vue plongeante) | fréquent si la caméra est basse |
| Zone aveugle | le coin sous la caméra, jusqu'à la ligne de but de ce côté | aucune si la hauteur suffit |

Ces valeurs sont des attentes ; elles se mesurent au jalon J2 sur une course
chronométrée (VIS-PHY-005) et se consignent par salle.
