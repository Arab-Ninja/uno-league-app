# L'identité UNO League

L'écusson, ses déclinaisons, et de quoi les refabriquer. Les fichiers de
référence sont les **SVG** ; tous les PNG de l'application en sont dérivés par
`exporte.mjs` et `exporte-android.mjs`, jamais retouchés à la main.

## Pourquoi un écusson, et un ballon dedans

Deux tours de dessin, et chacun a éliminé quelque chose.

**Le premier a choisi la forme.** Quatre pistes rendues côte à côte — un
écusson, un ballon logé dans un U, un terrain vu du dessus, trois barres de
division. Une seule survit aux deux épreuves qui comptent : **vingt-quatre
pixels**, où le ballon devenait un œil et les barres une jauge de réseau ; et
**une seule encre**, celle d'un maillot brodé, où l'écusson orange plein
s'effondrait en une tache grise. L'écusson garde en prime ce qu'aucune autre
forme ne dit aussi vite : *ceci est une ligue*.

**Le second a choisi ce qu'on met dedans.** L'initiale seule ne disait rien du
sport — c'est une lettre, pas un emblème. Quatre motifs essayés : le ballon,
le U porteur du ballon, le ballon lancé, et la silhouette d'une frappe. La
frappe est la plus belle à quatre-vingt-seize pixels et la première à mourir
en dessous de trente-deux ; le U porteur encombre le ballon d'un anneau. Reste
le ballon, dont le **pentagone est orange** plutôt que sombre : c'est ce qui
le sépare du ballon de n'importe qui.

Le pentagone est **calculé**, jamais recopié. Dessiné à la main il penche
toujours un peu, et c'est la première chose que l'œil voit.

## Les fichiers

| Fichier | À quoi il sert |
|---|---|
| `mark.svg` | L'écusson seul, en couleurs. La référence. |
| `mark-mono.svg` | Une seule encre, prise sur `currentColor`. Le ballon est **évidé**. |
| `icon.svg` | La tuile d'application, coins arrondis compris. |
| `icon-maskable.svg` | La tuile que les systèmes ont le droit de rogner. |
| `badge.svg` | La silhouette des notifications Android. |
| `fond.svg` | Le fond plein d'une icône adaptative Android. |

`rendu/` porte trois tailles qu'aucun code ne lit mais qu'on redemande sans
cesse : le carré de 1024 px que réclame l'App Store, la couche de premier plan
Android, et l'écusson en 512 px pour une fiche ou une affiche. Elles sont
versionnées parce qu'on les cherche au mauvais moment — la veille d'un dépôt.

`apps/web/src/components/brand/uno-mark.tsx` en est la transcription React,
inline pour que la marque ne clignote pas au premier écran. **Les deux doivent
bouger ensemble.**

## Refabriquer la marque

```bash
cd docs/branding
python3 genere.py         # les six SVG, à partir d'une seule géométrie
node exporte.mjs          # favori, icônes web, badge de notification
node exporte-android.mjs  # les six densités du projet Android
```

`genere.py` est la source de vérité. L'écusson, sa version monochrome, les
deux tuiles et le badge sont le même dessin à trois habillages : écrits
séparément, ils divergent au premier ajustement — et l'on s'en aperçoit le
jour où l'icône du téléphone ne ressemble plus au favori de l'onglet.

Le composant React `apps/web/src/components/brand/uno-mark.tsx` est régénéré
depuis `mark.svg` et `mark-mono.svg` : il en est la transcription, pas une
seconde version.

Le rendu passe par Chromium plutôt que par une bibliothèque de conversion :
c'est le moteur qui affichera le SVG, donc le PNG ne peut pas en diverger — ce
qui arrive dès qu'un convertisseur interprète un masque à sa façon.

## Trois pièges rencontrés

- **`--shot-max` rogne, il ne réduit pas.** Rien à voir avec la marque, mais
  c'est la même famille d'erreur : une image plafonnée perd le bas, pas
  l'échelle.
- **Une icône « maskable » n'est pas l'icône ordinaire.** Le manifeste
  déclarait la même source pour les deux ; Android rognait donc dans une forme
  qui mordait sur les épaules de l'écusson. Elle a maintenant sa version
  rembourrée, où tout tient dans les 66 % du centre.
- **`innerHTML` détruit un SVG.** Le fragment est analysé en HTML, qui met les
  attributs en minuscules : `viewBox` devient `viewbox` et le dessin
  disparaît. Il faut `DOMParser` en `image/svg+xml`.

## Le mot

« UNO » en blanc, « LEAGUE » en orange `#F97316`, en Roboto Condensed gras,
interlettrage `.08em`. Il se compose en HTML à côté de l'écusson plutôt que
d'être vectorisé : une police convertie en courbes ne se corrige plus.

## La palette

| Usage | Couleur |
|---|---|
| Fond, corps de l'écusson | `#0F172A` |
| Accent, contour | `#F97316` |
| Le U | `#FFFFFF` |
