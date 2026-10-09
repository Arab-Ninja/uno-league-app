# UNO Vision — analyse vidéo des sessions

UNO Vision est le projet compagnon d'UNO League : à partir de
l'enregistrement d'une session, il reconstruit un radar (position de chaque
joueur et du ballon), en déduit les actions — buts, tirs, arrêts, passes
décisives, défenses, gardien en poste — et les données physiques, puis les
soumet à la supervision de l'admin avant de créer une **feuille de saisie en
brouillon** dans cette application.

Son code et sa documentation vivent dans le dépôt
[`Arab-Ninja/uno-league-vision`](https://github.com/Arab-Ninja/uno-league-vision)
(`docs/README.md` y est le point d'entrée).

Ce dossier ne garde que ce qui engage UNO League :

- [`06-CONTRAT-ECHANGE.md`](06-CONTRAT-ECHANGE.md) — le contrat d'échange,
  **identique dans les deux dépôts** : identifiants partagés, flux par le
  routeur `tracker`, types d'action, métriques, fichiers CSV, et la liste des
  modifications attendues côté UNO League (lot « V1-UNO », §7).

Toute modification du contrat se fait dans les deux dépôts, dans le même
mouvement, avec une version de contrat incrémentée si elle n'est pas
additive.
