# L'identité UNO League

L'écusson, ses déclinaisons, et de quoi les refabriquer. Le fichier de
référence est **`mark.svg`** ; tout le reste — les cinq autres SVG, le favori
du site, le composant React, les PNG de l'application, la couverture du
dossier — en découle par script, jamais à la main.

## Pourquoi un écusson, et un ballon dedans

Trois tours de dessin, et chacun a éliminé quelque chose.

**Le premier a choisi la forme.** Quatre pistes rendues côte à côte — un
écusson, un ballon logé dans un U, un terrain vu du dessus, trois barres de
division. Une seule survit aux deux épreuves qui comptent : **vingt-quatre
pixels**, où le ballon devenait un œil et les barres une jauge de réseau ; et
**une seule encre**, celle d'un maillot brodé. L'écusson garde en prime ce
qu'aucune autre forme ne dit aussi vite : _ceci est une ligue_.

**Le deuxième a choisi ce qu'on met dedans.** L'initiale seule ne disait rien
du sport — c'est une lettre, pas un emblème. Quatre motifs essayés : le
ballon, le U porteur du ballon, le ballon lancé, la silhouette d'une frappe.
La frappe est la plus belle à quatre-vingt-seize pixels et la première à
mourir en dessous de trente-deux ; le U porteur encombre le ballon d'un
anneau. Reste le ballon.

**Le troisième a inversé les valeurs**, et c'est lui qui a fait le logo.
Jusque-là l'écusson était marine, cerné d'un filet orange, et le ballon blanc
posé dedans : trois couleurs, un contour fin, et à seize pixels le filet
disparaissait avant tout le reste. La version retenue fait l'inverse —
**l'écusson est orange plein, le ballon est en creux**. Deux couleurs, aucun
contour, et une masse qui tient à n'importe quelle taille. C'est aussi la
version qui se brode : une forme pleine et un creux, rien d'autre.

## Les quatre réglages

Le dessin tient à quatre nombres, en tête de `genere.py`. Ils ont été arrêtés
en rendant les variantes côte à côte à 64, 48, 32, 24, 20 et 16 pixels, sur
les deux fonds — c'est la seule épreuve qui départage, l'œil se trompe à
grande taille.

| Réglage     | Valeur | Ce qu'on perd en s'en écartant                                                |
| ----------- | ------ | ----------------------------------------------------------------------------- |
| `BALLON_Y`  | 29     | À 30, la pointe de l'écusson est à l'étroit sous le ballon.                   |
| `BALLON_R`  | 13,5   | À 14, l'écusson n'est plus qu'un liseré et s'efface sur blanc.                |
| `PENTAGONE` | 0,54   | À 0,50, les branches s'allongent : ce n'est plus un ballon, c'est une étoile. |
| `COUTURE`   | 0,26   | En dessous de 0,22, les coutures se dissolvent à seize pixels.                |

Le pentagone est **calculé**, jamais recopié. Dessiné à la main il penche
toujours un peu, et c'est la première chose que l'œil voit.

## Plein ou évidé : les deux ne servent pas au même

C'est la seule subtilité du dessin, et elle est facile à prendre à l'envers.

- **`mark.svg` : le ballon est un disque marine _posé_.** La marque est alors
  autonome — sur le marine de l'application comme sur le blanc d'un document,
  elle est identique. Un ballon évidé prendrait la couleur du fond et se
  dissoudrait sur le marine.
- **`mark-mono.svg` et `badge.svg` : le ballon est _évidé_.** Là il n'y a
  qu'une encre : un ballon plein de cette même encre ne ferait qu'une tache
  avec l'écusson. C'est le cas du maillot brodé, du tampon, et de la
  notification Android — dont le système ne garde que la silhouette.

## Les fichiers

| Fichier             | À quoi il sert                                           |
| ------------------- | -------------------------------------------------------- |
| `mark.svg`          | L'écusson seul, en couleurs. **La référence.**           |
| `mark-mono.svg`     | Une seule encre, prise sur `currentColor`. Ballon évidé. |
| `icon.svg`          | La tuile d'application, coins arrondis compris.          |
| `icon-maskable.svg` | La tuile que les systèmes ont le droit de rogner.        |
| `badge.svg`         | La silhouette des notifications Android.                 |
| `fond.svg`          | Le fond plein d'une icône adaptative Android.            |

`rendu/` porte trois tailles qu'aucun code ne lit mais qu'on redemande sans
cesse : le carré de 1024 px que réclame l'App Store, la couche de premier plan
Android, et l'écusson en 512 px pour une fiche ou une affiche. Elles sont
versionnées parce qu'on les cherche au mauvais moment — la veille d'un dépôt.

`famille.png` est la planche qu'on montre : elle est engendrée, elle aussi.

## Refabriquer la marque

```bash
cd docs/branding
python3 genere.py         # les six SVG, le favori du site, le composant React
node exporte.mjs          # icônes web, badge de notification, tailles de dépôt
node exporte-android.mjs  # les six densités du projet Android
python3 famille.py && node rendu.mjs famille.html famille.png   # la planche
```

`genere.py` est la source de vérité, et il écrit **hors de ce dossier** :

- `apps/web/public/favicon.svg` — le favori est l'écusson lui-même ;
- `apps/web/src/components/brand/uno-mark.tsx` — la transcription React, posée
  _inline_ pour que la marque n'arrive pas après le premier écran. Elle porte
  un avertissement : la retoucher à la main ne sert à rien, le prochain
  passage du script l'efface.

`docs/dossier/build.py`, lui, **lit** `mark.svg` au moment de fabriquer la
couverture. C'est la raison d'être d'un fichier de référence : un fragment SVG
recopié dans un script finit toujours par montrer la marque d'avant.

Le rendu des PNG passe par Chromium plutôt que par une bibliothèque de
conversion : c'est le moteur qui affichera le SVG, donc le PNG ne peut pas en
diverger — ce qui arrive dès qu'un convertisseur interprète un masque à sa
façon.

## Quatre pièges rencontrés

- **Une icône « maskable » n'est pas l'icône ordinaire.** Le manifeste
  déclarait la même source pour les deux ; Android rognait donc un cercle dans
  une image sans marge, et mordait sur les épaules de l'écusson. Elle a
  maintenant sa version rembourrée, où tout tient dans les 66 % du centre.
- **`innerHTML` détruit un SVG.** Le fragment est analysé en HTML, qui met les
  attributs en minuscules : `viewBox` devient `viewbox` et le dessin
  disparaît. Il faut `DOMParser` en `image/svg+xml`.
- **Le fond d'une icône adaptative Android ne s'encastre pas.**
  `mipmap-anydpi-v26/ic_launcher.xml` encastrait les deux couches à 16,7 % ;
  le fond s'arrêtait donc à la zone de sécurité, et le lanceur laissait voir du
  vide au-delà — dans les coins d'une tuile carrée, et pendant l'animation de
  parallaxe, qui déplace justement les deux couches l'une par rapport à
  l'autre. Seul le premier plan garde l'encastrement : c'est lui qui fabrique
  la zone de sécurité, et c'est pourquoi `mark.svg` est fourni sans marge.
- **`fetch()` ne lit pas un `file://`.** Une planche de comparaison qui allait
  chercher ses SVG à côté d'elle s'affichait vide, sans la moindre erreur. Les
  fragments y sont désormais posés au moment d'écrire le HTML.

## Le mot

« UNO » puis « LEAGUE », en Roboto Condensed gras, interlettrage `.08em`.
« LEAGUE » est toujours orange ; « UNO » prend la couleur du texte autour —
blanc sur marine, marine sur blanc. Le mot se compose en HTML à côté de
l'écusson plutôt que d'être vectorisé : une police convertie en courbes ne se
corrige plus.

## La palette

| Usage                                  | Couleur   |
| -------------------------------------- | --------- |
| Écusson, accent, « LEAGUE »            | `#F97316` |
| Fond de l'application, ballon en creux | `#0F172A` |
