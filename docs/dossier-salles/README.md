# Dossier « salles » — la proposition faite aux salles omnisports

Sept pages pour le gestionnaire d'une salle (Forêt de Soignes Sport,
Mounier, XL Sports…) : ce que nous lui demandons, ce que voient ses clients
avant et après le match, pourquoi ils reviennent, ce que nous pouvons faire
pour lui. Il accompagne le courriel **2e** de `docs/demarches/courriels.txt` ;
la démarche complète (script d'appel, liste des salles) est dans
`docs/demarches/salles-omnisports.md`.

**Il se décline par salle** : le nom du centre est sur la couverture, dans le
texte et **dans les captures** — le calendrier, la proposition et la
réservation montrent des séances chez lui. Le gestionnaire voit sa salle
dans l'application, au lieu d'avoir à l'imaginer.

Comme le dossier principal, rien n'est versionné hors des sources : captures,
HTML, PDF et aperçus se refabriquent.

## Fabriquer le dossier d'une salle

Prérequis : la base de démonstration et les deux serveurs, comme pour le
dossier principal (`docs/dossier/README.md`).

```bash
pnpm db:migrate && pnpm db:seed && pnpm dev     # base de démonstration, API et site
SLUG=mounier node docs/dossier-salles/captures.mjs
python3 docs/dossier-salles/build.py mounier
node docs/dossier-salles/pdf.mjs mounier
```

Le résultat est `docs/dossier-salles/UNO-League-salles-mounier.pdf`, avec un
aperçu de chaque page (`apercu-mounier-p1.png`…).

Playwright n'est pas une dépendance du dépôt : s'il est installé ailleurs,
`PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs` devant les deux
commandes `node` (l'entrée `index.mjs`, pas `index.js` : le script l'importe
en module).

### Une salle de plus

Une ligne dans `salles.json` — l'identifiant, et le nom tel qu'il doit
s'afficher — puis les trois commandes ci-dessus. Le même fichier sert aux
captures et au texte : le dossier ne peut pas nommer la salle de deux façons.
`generique` (« Votre salle ») sert quand on ne sait pas encore à qui l'on
écrit.

### Le nom de la salle dans les captures

`captures.mjs` intercepte les réponses de l'API et y remplace le nom des
terrains de démonstration (`Fit Five Forest`, `City Five`, `YC Five`,
`Arena`) par celui de la salle. La base n'est pas modifiée. Si le jeu de
démonstration change de terrains, la liste `TERRAINS_DEMO` du script suit.

**Sur une base fraîche, la liste des lieux peut être vide** : une migration
crée le terrain de Londerzeel, et le semis, qui ne remplit la table `venues`
que si elle est vide, n'y ajoute alors pas les terrains de démonstration. La
capture « Proposer un créneau » montre alors « Choisir un lieu ». Pour la
prise, ajouter les quatre terrains à la main dans la base locale :

```sql
INSERT INTO venues (slug, name, description, timezone, images, active, sort_order) VALUES
  ('fit-five-forest', 'Fit Five Forest', '', 'Europe/Brussels', '[]', 1, 0),
  ('yc-five', 'YC Five', '', 'Europe/Brussels', '[]', 1, 1),
  ('city-five', 'City Five', '', 'Europe/Brussels', '[]', 1, 2),
  ('arena', 'Arena', '', 'Europe/Brussels', '[]', 1, 3);
```

## La séance terminée vient de la production

La page 4 montre une séance terminée : podium, résultats et feuille de match,
**vidéo et moments forts**. Le jeu de démonstration n'a pas de vidéo ; la
page doit donc montrer une vraie séance, prise sur un téléphone et posée à
la main :

| Fichier                              | Ce qu'il montre                                             |
| ------------------------------------ | ----------------------------------------------------------- |
| `captures/prod/seance-podium.png`    | le haut de la séance terminée, jusqu'au podium              |
| `captures/prod/seance-resultats.png` | les résultats des matchs et le début de la feuille de match |
| `captures/prod/seance-video.png`     | la vidéo de la séance et la liste de ses moments-clés       |

Ces captures servent à toutes les salles. Tant que `seance-video.png`
manque, la page porte un cadre « Capture à fournir » et `pdf.mjs` imprime
`UNO-League-salles-<salle>-BROUILLON.pdf` : un brouillon ne peut pas partir
sous le nom du dossier définitif. Le podium et les résultats ont une
doublure, prise sur une séance jouée du jeu de démonstration.

Ce sont de vrais joueurs : leur accord avant de diffuser leur visage et leurs
statistiques à un tiers. La note en bas de la page 4 le dit au lecteur
(« une vraie séance UNO League »).

## Ce qui ne vit pas ici

La feuille de style, les polices, l'écusson, le code QR et le barème (prix de
l'heure, récompenses, divisions) sont ceux du dossier principal :
`build.py` exécute `docs/dossier/build.py` jusqu'au repère
`# --- Les trois langues`, et refuse de construire si le repère a disparu.
Un tarif changé là-bas change ici au tirage suivant.

À relever à chaque tirage : `DATE_SALLES`, en tête de `build.py`.
