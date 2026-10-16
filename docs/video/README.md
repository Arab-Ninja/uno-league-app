# Publicité vidéo — « La saison »

47 secondes en 9:16 (1080 × 1920, 30 images/s), pour Reels, TikTok, Stories
et Shorts. Comme le flyer, la vidéo n'est pas montée à la main : elle est
**écrite**. `saison.html` décrit chaque image en fonction du temps, Chromium la
photographie, et ffmpeg l'assemble avec la musique.

## L'histoire

Tout le monde commence quelque part. Le joueur nº 72 arrive en hologramme :
une carte vide, note 50, division 3. Personne ne le connaît. Douze semaines
plus tard, sa carte est en or, et il est en D1.

| Temps   | Scène                                                                      |
| ------- | -------------------------------------------------------------------------- |
| 0 – 13  | La carte se dessine en lumière : « Joueur nº 72 », « Personne ne le connaît. Pas encore. » |
| 13,6    | Le drop : la carte se matérialise en bronze. Semaine 01, première séance.  |
| 17      | Semaine 04 : meilleur buteur de la séance, +150 UNO.                       |
| 20,4    | Semaine 07 : top 5 de la séance, montée en D2 — la carte passe en argent. |
| 23,8    | Semaine 10 : son nom circule (invitation, club, 1ᵉʳ de la D2).             |
| 28      | La basse s'arrête : semaine 12, dernière séance de la saison.             |
| 30,6    | Elle revient : montée en D1, la carte passe en or.                         |
| 34      | La carte se retourne : le bilan de la saison.                              |
| 37,4    | Le rappel : la carte nº 72 d'il y a douze semaines, à côté de la carte or. |
| 41,6    | Seconde respiration : la carte nº 73, vide. « Ta saison commence maintenant. » |
| 44,1    | La marque, les stores, le site.                                            |

Chaque chapitre change sur un premier temps de la musique (141,5 BPM, une
mesure toutes les 1,696 s), et chaque phrase reste de deux à quatre secondes
à l'écran.

## Ce qui est vrai

L'histoire suit les règles de l'application (`packages/shared/src/constants.ts`) :
un nouveau joueur démarre en D3 à la note 50 ; la carte est bronze en D3,
argent en D2, or en D1 ; la note bouge de 3 points au plus par séance (la
saison compte 24 séances, de 50 à 87) ; les 5 meilleurs des 15 joueurs d'une
séance montent ; le meilleur buteur d'une séance de D3 reçoit 150 UNO. Aucun
montant en euros n'est annoncé comme gain : seul le prix des séances,
10 €/h, apparaît.

La carte reprend le dessin de `apps/web/src/components/fut-card/`. Le joueur
est un compte de démonstration : nom et visage fictifs.

## Les fichiers

| Fichier                | À quoi il sert                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| `saison.html`          | La vidéo, image par image. S'ouvre aussi dans un navigateur.         |
| `rendu.mjs`            | Monte la musique, capture les images, encode le MP4.                 |
| `img/portrait.png`     | Le portrait détouré, versionné pour que la page tourne seule.        |
| `detoure.py`           | Le refait depuis la capture de la carte du flyer.                    |
| `carte/fond-or.html`   | La carte or vide, dont `detoure.py` retire le fond au pixel près.    |

## Refabriquer

La musique (« Football edits ») n'est pas versionnée : posez-la dans
`docs/video/musique/football-edits.wav`, ou donnez son chemin dans `MUSIQUE`.

```bash
node docs/video/rendu.mjs        # rendu/UNO-League-la-saison-9x16.mp4 — Playwright et ffmpeg
```

Le script garde le début du morceau jusqu'au temps fort de 44,15 s, puis
enchaîne sur sa fin, à partir du même temps fort à 93,28 s : la vidéo dure
47,2 s et se termine avec le morceau. Le rendu prend une dizaine de minutes
(quatre navigateurs en parallèle, `ONGLETS=…` pour changer). Pour relire une
image sans tout refaire :

```bash
node docs/video/rendu.mjs --instants 4.6,14.3,31.3   # rendu/instant-<t>.png
```

Pour régler une animation en direct, servez le dépôt et ouvrez la page : elle
se joue avec la musique montée (après un premier rendu), et le curseur va
n'importe où dans le temps.

```bash
python3 -m http.server -d . 8000
# http://localhost:8000/docs/video/saison.html
```

Pour refaire le portrait (après avoir changé la capture du flyer) :

```bash
node docs/video/rendu.mjs --fond-or && python3 docs/video/detoure.py
```

## Ce qui tient ensemble

Les instants de `saison.html` (l'objet `T`) sont des mesures de la musique,
et `COUPE` / `REPRISE` dans `rendu.mjs` en sont deux autres. Changer de
musique demande de les remesurer ensemble.

Le texte reste entre 230 et 1 700 px du haut : au-dessus et en dessous, les
applications posent leurs propres boutons et légendes.
