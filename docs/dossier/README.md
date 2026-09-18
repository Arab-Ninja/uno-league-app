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
node docs/dossier/captures.mjs

# 2. Les captures et la police, emballées en base64 dans assets.py.
python3 docs/dossier/pack.py

# 3. Le HTML, puis le PDF.
python3 docs/dossier/build.py && node docs/dossier/pdf.mjs
```

Le résultat est `docs/dossier/UNO-League-dossier.pdf`.

## Deux captures ne viennent pas de là

`pack.py` attend `captures/boutique-reelle.png` et `captures/profil-reel.png` :
ce sont des captures prises **sur un vrai téléphone**, pas dans le jeu de
démonstration. La boutique y présente un catalogue réellement rempli, et la
carte est celle du porteur du projet. Elles valent mieux qu'une capture de
démonstration, précisément parce qu'elles ne sont pas une démonstration.

Si vous les remplacez, retirez la barre d'état du téléphone : les autres
captures n'en ont pas, et le mélange se voit.

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

La taille de page est déclarée en millimètres (`@page { size: 210mm 297mm }`)
et lue par `preferCSSPageSize`. Le mot-clé `format: "A4"` de Playwright
sortait des pages de 210,2 × 297,3 mm : trois dixièmes de trop, assez pour
qu'une visionneuse mette le dossier à l'échelle.

## Ce qui reste à compléter à la main

Un seul champ entre crochets subsiste, sur la dernière page de `build.py` :
le **numéro d'entreprise** de VIP Drivers. Un dossier adressé à un organisme
belge le réclamera ; il n'est écrit nulle part dans le dépôt.

Les trois mêmes manques valent pour `apps/web/public/confidentialite.html`,
qui attend encore la forme juridique, l'adresse du siège et ce même numéro.
