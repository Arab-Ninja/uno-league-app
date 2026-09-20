# L'identité UNO League

L'écusson a été **fourni**, en PNG. Ce dossier porte la source détourée et le
script qui en tire tout ce dont l'application a besoin.

## Ce qui est provisoire, et ce qui le restera

L'écusson est un _premium crest_ : un entrelacs et un ballon, dessinés pour
être vus grand. Deux conséquences qu'il faut avoir en tête.

**La source fait 148 × 184 pixels.** Tout ce qui dépasse 256 est un
agrandissement. L'aplat le supporte jusqu'à 512 ; le **1024 réclamé par l'App
Store est visiblement mou**. Avant de déposer sur l'App Store, il faudra une
version vectorielle (SVG, PDF, AI) ou un export d'au moins 1024 pixels.

**En dessous de 32 pixels, l'entrelacs devient une tache** et le ballon
disparaît. C'est inhérent au dessin, pas au fichier : un motif à quatre boucles
enlacées n'a pas de quoi tenir dans seize pixels. Le favori et le badge s'en
accommodent parce qu'ils sont rarement vus si petits ; si la ligue veut un jour
une marque lisible à seize pixels, il faudra un dessin plus simple à côté de
celui-ci, pas un meilleur export.

## Deux pièges du détourage

- **Le fond blanc ne s'enlève pas en remplaçant le blanc** : le ballon est
  blanc lui aussi, et un remplacement global l'aurait percé. Le fond est rempli
  depuis les quatre coins, ce que le ballon, enclos dans l'écusson, ne subit
  pas.
- **Le badge de notification ne se découpe pas sur l'alpha.** Android n'en
  garde que la silhouette, qu'il reteint en blanc — or tout l'écusson est
  opaque, donc on obtenait un écusson plein, muet. La découpe se fait sur la
  **couleur** : le marine est évidé, l'entrelacs survit.

## Les fichiers

| Fichier                | À quoi il sert                                    |
| ---------------------- | ------------------------------------------------- |
| `crest.png`            | La source détourée. **La référence.**             |
| `crest-silhouette.png` | La découpe sur la couleur, pour le badge.         |
| `genere.py`            | En tire tous les formats.                         |
| `rendu/`               | Les tailles qu'on redemande la veille d'un dépôt. |

## Refabriquer

```bash
python3 docs/branding/genere.py
```

Le script écrit hors de ce dossier : favori, icônes web, badge, marque de
l'écran d'accueil, et les six densités du projet Android. `docs/dossier/build.py`
lit `rendu/crest-512.png` pour la couverture — un fragment recopié dans un
script finit toujours par montrer la marque d'avant.

## La palette

| Usage                 | Couleur   |
| --------------------- | --------- |
| Fond de l'application | `#0F172A` |
| Accent, « LEAGUE »    | `#F97316` |
