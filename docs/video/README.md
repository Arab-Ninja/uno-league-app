# Publicité vidéo — « Joue. Grimpe. Gagne. »

Vingt secondes en 9:16 (1080 × 1920, 60 images/s), pour Reels, TikTok,
Stories et Shorts. Comme le flyer, la vidéo n'est pas montée à la main : elle
est **écrite**. `pub.html` décrit chaque image en fonction du temps, Chromium
la photographie 1 200 fois, et `musique.py` synthétise la bande-son sur la
même grille.

## Le découpage

Le morceau est à 120 BPM : une mesure toutes les deux secondes, et chaque
scène change sur un premier temps.

| Temps   | Scène                                                                  |
| ------- | ---------------------------------------------------------------------- |
| 0 – 2   | Les projecteurs s'allument : « Et si ton futsal te rapportait ? »      |
| 2 – 4   | La frappe enflammée, la marque                                         |
| 4 – 8   | **01 Joue.** La séance se remplit, tu prends la dernière place        |
| 8 – 12  | **02 Grimpe.** Ta carte se retourne, tu montes de la D3 à la D1        |
| 12 – 16 | **03 Gagne.** +250 UNO = 25 €\*, ce que paient tes points              |
| 16 – 20 | L'écusson se construit, « Joue. Grimpe. Gagne. », les stores, le site |

Les chiffres sont ceux du barème (`packages/shared/src/constants.ts`) :
meilleur buteur de D1 = 250 UNO, 10 UNO = 1 €, séance de deux heures à 20 €,
soit 10 €/h. La mention « non échangeables contre des espèces » reste à
l'écran tant que le montant en euros y est. À relire si le barème change.

Les visuels viennent du dépôt : l'écusson (`docs/branding/ecusson.svg`),
l'illustration et les captures du flyer (`docs/flyer/img/`). La carte joueur
est détourée au chargement de la page ; les visages sont ceux du jeu de
démonstration, donc fictifs.

## Refabriquer

```bash
python3 docs/video/musique.py   # rendu/musique.wav — numpy et scipy
node docs/video/rendu.mjs       # rendu/UNO-League-pub-9x16.mp4 — Playwright et ffmpeg
```

Le rendu prend quelques minutes (quatre onglets en parallèle, `ONGLETS=…` pour
changer). Pour relire une image précise sans tout refaire :

```bash
node docs/video/rendu.mjs --instants 1.6,6.2,13.7   # rendu/instant-<t>.png
```

Pour régler une animation en direct, servez le dépôt et ouvrez la page : elle
se joue avec la musique, et le curseur va n'importe où dans le temps.

```bash
python3 -m http.server -d . 8000
# http://localhost:8000/docs/video/pub.html
```

Un serveur plutôt que `file://` : le navigateur refuse sinon de lire les pixels
de la carte pour la détourer.

## Ce qui tient ensemble

Les instants des bruitages de `musique.py` (tapotements, pièce, montées de
division) reprennent ceux de `pub.html`. Une animation déplacée dans l'un se
déplace dans l'autre.

Le texte reste entre 250 et 1 700 px du haut : au-dessus et en dessous, les
applications posent leurs propres boutons et légendes.
