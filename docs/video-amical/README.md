# Vidéo « Match amical »

Une publicité verticale de 33 secondes (1080 × 1920, 60 images/s) qui montre
ce qu'il reste d'un match amical dans l'application : le podium, le score,
la feuille de match, la vidéo et ses moments-clés, l'équipe sur le terrain.
Elle se termine sur un appel générique à réserver sa session.

La séance montrée est le match amical du **vendredi 20 novembre 2026** à
Fit Five Forest (Équipe Bleue 9 – 15 Équipe Noire), relevé sur la page
« Détail de la session ».

## Ce que la vidéo montre, et ce qu'elle ne montre pas

- **Pas de visages.** Les cartes et le terrain affichent les initiales, comme
  l'application le fait pour un joueur sans photo. La vidéo du match est
  remplacée par une caméra dessinée, aux silhouettes sans visage : les
  enregistrements sont réservés aux joueurs de la séance (SUP-002).
- **Des noms abrégés** : prénom et initiale du nom. Les conditions
  d'utilisation ne prévoient pas d'usage promotionnel des noms complets.
- **Les postes de l'Équipe Noire sont provisoires** (`donnees.js`,
  `terrain.noire`) : seule la composition de l'Équipe Bleue a été relevée.

## Fichiers

| Fichier       | Rôle                                                              |
| ------------- | ----------------------------------------------------------------- |
| `donnees.js`  | La séance : score, podium, feuille, moments-clés, compositions.   |
| `index.html`  | La page de la vidéo. Ouverte dans un navigateur, elle se joue.    |
| `style.css`   | Les composants de l'app redessinés (jetons, polices, tailles).    |
| `scenes.css`  | La mise en page des huit scènes.                                  |
| `scenes.js`   | Les scènes et leur chorégraphie, seconde par seconde.             |
| `moteur.js`   | Le moteur d'animation : l'image à l'instant t ne dépend que de t. |
| `son.py`      | La bande-son, entièrement synthétisée (aucun droit à gérer).      |
| `rendu.mjs`   | Le rendu image par image, puis l'encodage et le mixage.           |

## Refaire la vidéo

Prérequis : Node 22, Chromium pour Playwright, ffmpeg, Python 3 avec numpy.

```bash
python3 docs/video-amical/son.py         # rendu/son.wav
node docs/video-amical/rendu.mjs         # rendu/match-amical-60.mp4 (≈ 10 min)
node docs/video-amical/rendu.mjs --images 4.5,13.8,23.3   # quelques images PNG
```

Tout sort dans `docs/video-amical/rendu/`, ignoré par git. Le fichier final
est en H.264 et AAC, au niveau sonore attendu par Instagram et TikTok
(−14 LUFS). Une version sans son (`match-amical-muet-60.mp4`) sert à poser
un son tendance directement dans l'application du réseau.

## Réutiliser pour une autre séance

Changer `donnees.js` suffit pour la plupart des séances : les compteurs, les
cartes, la feuille, les moments et le terrain s'en construisent. Les
instants des effets sonores, eux, sont écrits dans `son.py` en face de ceux
de `scenes.js` : si l'on déplace une scène, il faut déplacer ses sons.
