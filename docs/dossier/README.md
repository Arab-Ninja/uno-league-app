# Dossier de présentation — comment le refabriquer

Le PDF présenté aux organismes d'aide et aux partenaires n'est pas écrit à la
main : il est engendré, pour que les chiffres du modèle économique restent
ceux que l'application applique réellement. Le barème vit dans
`packages/shared/src/constants.ts` ; `build.py` le recopie et recalcule tout
le reste. Une valeur écrite en dur finit par contredire celle d'à côté, et
c'est exactement ce qu'un lecteur de dossier cherche.

Le PDF, les captures et le module d'assets ne sont **pas** versionnés : ils
pèsent trois mégaoctets et se refabriquent en trois commandes.

## Les trois étapes

```bash
# 1. Les captures d'écran, depuis un jeu de démonstration servi en local.
#    Demande l'API et le site en marche, et une base remplie par `pnpm db:seed`.
#    Le drapeau ouvre le Football : sans lui, sa séance n'est pas semée.
FEATURE_BIGFOOT=true pnpm db:reset && FEATURE_BIGFOOT=true pnpm db:migrate
FEATURE_BIGFOOT=true pnpm db:seed
node docs/dossier/captures.mjs

# 2. Les captures et les polices (Barlow, Barlow Condensed — celles de
#    l'application), emballées en base64 dans assets.py.
python3 docs/dossier/pack.py

# 3. Le HTML, puis le PDF.
python3 docs/dossier/build.py && node docs/dossier/pdf.mjs
```

Le résultat est `docs/dossier/UNO-League-dossier.pdf`.

## Les terrains se capturent autrement

Trois captures — `terrain-ligue`, `terrain-grandfoot`, `club-terrain` — ne
prennent pas l'écran entier mais **la section** qui porte le terrain. Deux
raisons, et la seconde a coûté deux tirages :

- une capture de téléphone fait deux fois plus haut que large ; réduite à une
  demi-colonne, elle ne montre plus que des taches vertes ;
- `--shot-max` **rogne** l'image par le bas, il ne la réduit pas. Un terrain
  plafonné perd donc son gardien, ce qui est exactement la carte qu'on
  voulait montrer.

Le script mesure la section dans la page et la découpe (`clip`). L'image
obtenue est presque carrée et supporte d'être posée en pleine colonne.

Chacune est prise depuis un compte **qui joue la séance** : l'onglet de son
équipe porte la mention « vous » et les places y sont touchables. Depuis un
compte spectateur, l'écran est en lecture seule — ce n'est pas ce que voit un
inscrit.

Une seule des trois entre dans le PDF. Les deux autres restent dans
`captures/` : une page pleine largeur les rend lisibles, une demi-colonne les
réduit à de la décoration.

## Toutes les captures viennent du jeu de démonstration

Jusqu'à la version 8, la boutique et la carte de joueur étaient des captures
prises sur un vrai téléphone. Elles montraient l'interface d'avant la refonte
« Stade de nuit » : elles ont été remplacées par celles du jeu de
démonstration, et la page « Où en est le projet » le dit en clair — noms,
visages et statistiques y sont fictifs.

Pour la version diffusée (v9), deux substitutions ont été faites **au moment
de la capture**, hors du dépôt : un portrait fictif différent pour chaque
joueur affiché — le jeu de démonstration réutilise quelques photos, et deux
joueurs au même visage se remarquent — et des photos de produits sans marque
à la place des aplats de couleur du catalogue de démonstration.
`captures.mjs` ne le fait pas : relancé tel quel, il montre les visuels du
jeu de démonstration.

## Ce que `pdf.mjs` vérifie avant d'imprimer

Deux contrôles, tous deux nés d'un tirage raté :

- **Le document ne déborde pas en largeur.** Le halo de la couverture est
  posé à `right: -40mm` ; sans `overflow: hidden`, il élargissait le document
  à 250 mm, et Chromium réduisait alors tout le dossier à 84 % pour le faire
  tenir — chaque page s'imprimait entourée de blanc.
- **Aucune page n'est coupée en bas.** La contrepartie de `overflow: hidden`
  est qu'une page trop pleine ne se plaint pas : elle se tronque en silence.
  Chaque page est donc mesurée, et le script refuse d'imprimer plutôt que de
  livrer un dossier amputé. Quand il refuse, la variable CSS `--shot-max`
  plafonne la hauteur d'une capture là où la place manque.

**Chaque page garde une réserve d'au moins cinq millimètres.** Le dossier a
été réglé au pixel près, et il s'imprimait — jusqu'à ce qu'un autre binaire de
Chromium compose le même texte un demi-point plus haut et coupe trois pages.
Un document dont aucune page n'a de blanc en bas ne tient que sur la machine
qui l'a réglé. Pour mesurer cette réserve, ce n'est pas l'espace avant le pied
de page qu'il faut lire : `.note.bas` porte `margin-top: auto`, donc sur ces
pages-là tout le blanc part au-dessus de l'encadré.

La taille de page est déclarée en millimètres (`@page { size: 210mm 297mm }`)
et lue par `preferCSSPageSize`. Le mot-clé `format: "A4"` de Playwright
sortait des pages de 210,2 × 297,3 mm : trois dixièmes de trop, assez pour
qu'une visionneuse mette le dossier à l'échelle.

## Ce qui bougera

Plus aucun champ entre crochets. Cinq choses changeront pourtant :

- **le siège**, qui déménage de Ternat à Londerzeel. Dernière page de
  `build.py`, et même ligne dans `apps/web/public/confidentialite.html` ;
- **l'adresse du site**, si elle change : c'est la constante `SITE_PUBLIC` en
  tête de `build.py`, et rien d'autre. Le dossier doit toujours afficher une
  adresse qui répond — un lien mort dans un dossier de financement coûte plus
  cher qu'une adresse d'hébergeur ;
- **le nombre de tests**, constante `TESTS` en tête de `build.py`, à relever
  après un `pnpm test` complet. Écrit là et nulle part ailleurs : un chiffre
  recopié dans deux paragraphes finit par en contredire un ;
- **l'état des applications mobiles** : la constante `PUBLICATION_STORES` en
  tête de `build.py` (« en cours de publication sur l'App Store et Google
  Play »), imprimée sur la page « Où en est le projet » et sur la dernière.
  Le jour où les stores les publient, changer la phrase **et** les deux
  pastilles « En cours de publication » de la dernière page ;
- **les montants des tournois** : `TOURNOI_ENGAGEMENT_UNO` et
  `TOURNOI_FORMATS`. Ils ne sont pas des constantes du code mais des réglages
  de l'administration : si les formats changent en production, le dossier ne
  le saura pas tout seul.
