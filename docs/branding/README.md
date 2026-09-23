# L'identité UNO League

L'écusson a été **fourni en PNG** de 186 × 183 px, puis **redessiné en
vectoriel** : `ecusson.svg` est désormais la référence, et tout le reste en
découle.

## Ce qu'il représente

Un bouclier orange à bordure marine, un **nœud de Salomon** — deux boucles en
rectangle arrondi, inclinées de ±38°, qui passent alternativement dessus et
dessous — et un ballon au centre, là où les deux boucles se croisent.

Le redessin est fidèle à la source, avec trois retouches assumées :

- **symétrique** : la source penchait de quelques pixels, le tracé non ;
- **les croisements sont nets** : chaque boucle qui passe dessous s'interrompt
  sur la largeur de l'autre plus un filet orange, là où la source bavait ;
- **le ballon a la place qu'il avait à l'œil** : les anneaux sont un peu plus
  larges que la mesure brute, pour qu'il respire au centre au lieu de toucher
  les bandes.

## Ce qui reste vrai en petit

**En dessous de 32 pixels, l'entrelacs devient une tache** et le ballon un
point blanc. C'est inhérent au dessin, pas au fichier : un motif à deux boucles
enlacées n'a pas de quoi tenir dans seize pixels. Si la ligue veut un jour une
marque lisible à cette taille, il faudra un dessin plus simple à côté de
celui-ci, pas un meilleur export.

## Le badge de notification

Il ne se découpe pas sur l'alpha : Android n'en garde que la silhouette, qu'il
reteint en blanc, et tout l'écusson est opaque. Le marine et le blanc sont donc
évidés **sur la couleur** : l'entrelacs et le ballon se lisent en creux.

## Les fichiers

| Fichier       | À quoi il sert                                        |
| ------------- | ----------------------------------------------------- |
| `ecusson.svg` | Le tracé. **La référence.**                           |
| `dessine.py`  | L'écrit, avec les cotes et leur provenance.           |
| `rend.mjs`    | Le rend en `crest.png` de 2048 px de haut.            |
| `crest.png`   | Ce rendu, versionné pour que `genere.py` tourne seul. |
| `genere.py`   | En tire tous les formats.                             |
| `rendu/`      | Les tailles qu'on redemande la veille d'un dépôt.     |

## Refabriquer

```bash
python3 docs/branding/dessine.py   # après avoir retouché une cote
node docs/branding/rend.mjs        # demande Chromium (Playwright)
python3 docs/branding/genere.py
```

`genere.py` écrit hors de ce dossier : favori, icônes web, badge, la marque de
l'écran d'accueil (en SVG), les icônes et **les écrans de démarrage** du projet
Android. `docs/dossier/build.py` lit `rendu/crest-512.png` pour la couverture.

Les icônes et les écrans de démarrage Android sont des ressources **natives** :
ils partent avec le prochain AAB, pas avec une mise à jour à distance.

## Pour les stores

| Store       | Fichier               | Exigence                              |
| ----------- | --------------------- | ------------------------------------- |
| App Store   | `rendu/icon-1024.png` | 1024 × 1024, plein, sans transparence |
| Google Play | `rendu/play-512.png`  | 512 × 512, plein, pour la fiche       |

Les deux sont des carrés pleins sans coins arrondis : c'est le store qui
découpe, et des coins déjà arrondis laisseraient quatre triangles sombres sous
son masque.

## La palette

| Usage                       | Couleur   |
| --------------------------- | --------- |
| Fond de l'application       | `#0F172A` |
| Accent, « LEAGUE », écusson | `#F97316` |
| Bordure et entrelacs        | `#0B1321` |
