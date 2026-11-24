# Vidéo « Comment ça marche »

Une publicité verticale de 40 secondes (1080 × 1920, 60 images/s) qui
explique UNO League à quelqu'un qui n'en a jamais entendu parler, tout dans
un téléphone qui défile, sur une musique funk brésilien.

| Mesures | Instant  | Ce qu'on voit                                                                 |
| ------- | -------- | ----------------------------------------------------------------------------- |
| 0-1     | 0 s      | « Envie de jouer au futsal ? Même sans équipe ? », sur la vraie vidéo         |
| 2-3     | 3,7 s    | UNO League, l'app qui organise tes matchs de futsal                           |
| 4-5     | 7,4 s    | ① Choisis ton match : le calendrier, on touche le match amical                |
| 6-7     | 11,1 s   | ② Réserve ta place : « Rejoindre la session », « Payer 100 UNO », payé        |
| 8-9     | 14,8 s   | ③ Tu joues : la vraie vidéo du match                                          |
| 10-18   | 18,5 s   | ④ Après le match, tout est dans l'app : podium, score, feuille, vidéo, équipe |
| 19-21   | 35,1 s   | Match amical ou UNO League : réserve ta place dans l'app                      |

La séance montrée est le match amical du **vendredi 20 novembre 2026** à
Fit Five Forest (Equipe Bleue 9 – 15 Equipe Noire), relevée dans l'app.

## Ce qui est réel, ce qui ne l'est pas

- **Réel** : la séance (score, podium, feuille, moments-clés, Équipe Bleue),
  et la vidéo du match, tirée d'un enregistrement d'écran de l'app.
- **Noms abrégés, pas de photos** : prénom et initiale, initiales à la place
  des photos. Les conditions d'utilisation ne prévoient pas d'usage
  promotionnel des noms complets ni des photos.
- **Exemple** : la séance UNO League du dimanche 22 novembre, dans le
  calendrier (`donnees.js`, `calendrier.seances`), illustre l'autre mode.

## Fichiers

| Fichier       | Rôle                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| `donnees.js`  | La séance, le calendrier, les moments-clés, l'extrait vidéo.              |
| `index.html`  | La page de la vidéo. Ouverte dans un navigateur, elle se joue (sans son). |
| `style.css`   | Les écrans de l'app redessinés (jetons, polices, tailles en px d'app).    |
| `scenes.css`  | La mise en page de la vidéo.                                              |
| `scenes.js`   | Les écrans, le doigt, le défilement, la caméra, mesure par mesure.        |
| `moteur.js`   | Le moteur d'animation : l'image à l'instant t ne dépend que de t.         |
| `son.py`      | La musique et les bruitages, entièrement synthétisés (aucun droit).       |
| `rendu.mjs`   | Le rendu image par image, puis l'encodage et le mixage.                   |

## Refaire la vidéo

Prérequis : Node 22, Chromium pour Playwright, ffmpeg, Python 3 avec numpy.

1. Déposer l'extrait de la vraie vidéo dans `docs/video-amical/rendu/match.mp4` :
   24 s environ, recadrées sur le lecteur de l'app (un enregistrement d'écran
   pendant que la vidéo joue suffit). Par exemple :

   ```bash
   ffmpeg -ss 9.3 -to 33.3 -i enregistrement.mp4 \
     -vf "crop=1172:656:56:798,fps=30" -an docs/video-amical/rendu/match.mp4
   ```

2. Puis :

   ```bash
   python3 docs/video-amical/son.py      # rendu/son.wav
   node docs/video-amical/rendu.mjs      # rendu/match-amical-60.mp4 (≈ 15 min)
   node docs/video-amical/rendu.mjs --images 8.9,21.6,29.8   # quelques images
   ```

Tout sort dans `docs/video-amical/rendu/`, ignoré par git : ni la vidéo du
match ni les rendus n'entrent dans le dépôt. Le fichier final est en H.264 et
AAC, au niveau sonore attendu par Instagram et TikTok (−14 LUFS).

## Changer une scène

Le tempo est de 130 bpm : une mesure dure 1,846 s, et `m(n)` donne l'instant
de la mesure n, dans `scenes.js` comme dans `son.py`. Un geste ou une coupe
déplacé dans l'un se déplace aussi dans l'autre.
