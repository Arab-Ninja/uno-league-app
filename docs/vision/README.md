# UNO Vision — analyse vidéo des sessions UNO League

> **Statut : documentation de cadrage, version 0.1 — 9 octobre 2026.**
> Ce dossier est appelé à devenir la racine du dépôt séparé
> `arab-ninja/uno-league-vision`. Il vit ici le temps que ce dépôt soit créé.
> Le contrat d'échange (`06-CONTRAT-ECHANGE.md`) restera, lui, dans les deux
> dépôts : il engage les deux côtés.

UNO Vision prend l'enregistrement vidéo d'une session de futsal et en tire,
sans saisie manuelle, ce que l'écran **Administration → Saisie vidéo** d'UNO
League demande aujourd'hui à un opérateur : le score, les buteurs, les
passeurs, les défenses, les arrêts, le gardien en poste — et en plus, ce qu'un
humain ne peut pas relever : les vitesses, les accélérations, les distances,
la possession.

Rien de ce que l'IA propose n'entre au classement sans qu'un humain l'ait
validé. La publication reste un geste fait dans UNO League, par l'admin.

---

## Le principe : un radar, puis des déductions

Tout le projet repose sur une idée simple : **on ne demande pas à l'IA de
« reconnaître un but » en regardant la vidéo**. On lui demande quelque chose
de beaucoup plus borné — où est chaque personne, où est le ballon, à chaque
image, en mètres sur le terrain. C'est le *radar* : une vue de dessus
reconstruite, comme celle d'un jeu vidéo.

Une fois le radar établi, les actions s'en **déduisent** par des règles
lisibles, celles qu'un spectateur applique sans y penser :

- le ballon franchit la ligne de but entre les poteaux : *but* ;
- le ballon venait d'un coéquipier moins de cinq secondes avant : *passe
  décisive* ;
- le ballon passe d'un bleu à un rouge au contact, et les rouges le gardent
  deux secondes : *défense réussie* ;
- un tir cadré est repoussé par le joueur qui tient le but : *arrêt*.

```
 vidéo ──► détection ──► suivi ──► calibrage ──► RADAR ──► possession ──► règles ──► actions
          (personnes,   (pistes    (pixels →     (x, y en   (qui a le    (but, tir,   proposées
           ballon)       stables)   mètres)       mètres)    ballon)      arrêt…)        │
                                                                                         ▼
                                                                              supervision humaine
                                                                                         │
                                                                                         ▼
                                                                         feuille de saisie UNO League
                                                                                 + fichiers CSV
```

Pourquoi cette voie plutôt qu'un modèle qui « regarde » la vidéo et classe
les actions :

| | Reconnaissance visuelle de bout en bout | Radar + déductions |
|---|---|---|
| Données d'entraînement | des milliers de clips annotés par type d'action | quelques milliers d'images avec des boîtes « personne » et « ballon » |
| Explicabilité | aucune : le modèle « pense » qu'il y a eu but | totale : la règle cite la trajectoire, le porteur, la durée |
| Correction par l'admin | ré-entraîner un réseau | ajuster un seuil, ou corriger une identité |
| Statistiques physiques | impossibles | gratuites, elles sortent du même radar |
| Coût GPU | lourd, en entraînement comme en inférence | une détection d'objets, le reste tourne sur CPU |
| Effet d'une amélioration du suivi | aucun effet direct | toutes les actions en profitent à la fois |

C'est la voie standard de l'analyse sportive professionnelle, et la seule
qui tienne avec un seul GPU de 8 Go, une seule personne pour superviser, et
des caméras de centre five de qualité moyenne.

**Conséquence sur les priorités.** Toutes les actions sont des règles posées
sur le même radar : elles arrivent donc ensemble, en V1. Ce qui diffère est
leur fiabilité attendue, qui dépend de la qualité du suivi du ballon :

| Fiabilité attendue | Actions | Pourquoi |
|---|---|---|
| Haute | buts, score, vitesses, distances | le franchissement d'une ligne et la position des joueurs se voient même quand le ballon se perd |
| Moyenne | tirs, arrêts, passes décisives | il faut suivre le ballon sur quelques mètres avant l'action |
| À consolider | défenses, interceptions, possession | il faut savoir qui tient le ballon à chaque instant, dans des duels où il est caché |

La supervision comble l'écart le temps que les modèles apprennent sur les
vraies salles.

---

## Périmètre

| | V1 | V2 |
|---|---|---|
| Sport | futsal UNO League, 5 contre 5, 3 équipes, matchs de 10 min | football 7 à 11, gazon extérieur |
| Caméra | **fixe** : caméra du centre (grand angle « fish-eye ») ou GoPro sur trépied | GoPro tenue à la main, caméra qui bouge |
| Calibrage | une fois par salle et par emplacement de caméra, à la main | détection automatique du terrain à chaque image |
| Coups d'envoi | posés par l'admin | proposés par l'IA |
| Identité des joueurs | numéro de chasuble et désignation manuelle en début de match | lecture automatique du numéro |
| Actions | but, contre son camp, tir (cadré ou non), arrêt, passe décisive, défense, gardien en poste | fautes, sorties de balle, coups de pied arrêtés |
| Statistiques | possession par équipe et par joueur, passes, vitesse max et moyenne, accélération max, distance | — |
| Supervision | validation, correction, rejet et ajout de chaque action ; correction des identités | — |
| Sortie | feuille de saisie UNO League en brouillon via l'API, fichiers CSV | — |
| Apprentissage | jeu de données alimenté par les corrections, campagnes d'entraînement périodiques | classificateur d'actions entraîné sur les actions validées |
| Traitement | en différé, moins de 12 h après la session, sur un GPU local de 8 Go | — |

---

## Les documents

| Document | Ce qu'il fixe | À lire si… |
|---|---|---|
| [`01-EXIGENCES.md`](01-EXIGENCES.md) | les exigences numérotées, leur priorité, leur critère d'acceptation | vous voulez savoir *ce que* le système doit faire |
| [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) | les composants, la chaîne de traitement, la pile technique, le budget GPU | vous allez coder |
| [`03-TOURNAGE-ET-CALIBRAGE.md`](03-TOURNAGE-ET-CALIBRAGE.md) | comment filmer, comment calibrer une salle | vous filmez ou installez une caméra |
| [`04-REGLES-DE-DEDUCTION.md`](04-REGLES-DE-DEDUCTION.md) | la définition exacte de chaque action, ses seuils, ses modes de défaillance | vous contestez une action, ou réglez un seuil |
| [`05-SUPERVISION.md`](05-SUPERVISION.md) | les écrans de l'admin, le cycle de vie d'une action, les raccourcis | vous supervisez l'IA |
| [`06-CONTRAT-ECHANGE.md`](06-CONTRAT-ECHANGE.md) | le format des actions, des CSV, le flux API, les modifications côté UNO League | vous touchez à l'une ou l'autre application |
| [`07-DONNEES-ET-ENTRAINEMENT.md`](07-DONNEES-ET-ENTRAINEMENT.md) | le jeu de données, l'annotation, les campagnes d'entraînement, les métriques | vous voulez améliorer l'IA |
| [`08-FEUILLE-DE-ROUTE.md`](08-FEUILLE-DE-ROUTE.md) | les phases, leurs livrables, leurs critères de sortie | vous planifiez |
| [`09-DECISIONS.md`](09-DECISIONS.md) | les choix structurants et ce qu'ils coûtent | vous vous demandez « pourquoi pas autrement ? » |
| [`10-RGPD.md`](10-RGPD.md) | base légale, conservation, droits des personnes filmées | avant la première vraie session |

---

## Glossaire

| Terme | Sens dans ce projet |
|---|---|
| **Radar** | la vue de dessus reconstruite : position en mètres de chaque personne et du ballon, à chaque image |
| **Piste** (*track*) | la trajectoire d'une personne suivie d'image en image, portée par un identifiant temporaire |
| **Identité** | le lien entre une piste et un joueur réel (numéro de chasuble, compte UNO League) |
| **Calibrage** | la transformation des pixels de la caméra en mètres sur le terrain, propre à une salle et à un emplacement de caméra |
| **Homographie** | la matrice qui réalise ce passage pour un plan — ici, le sol |
| **Possession** | l'état « tel joueur tient le ballon », déduit de la proximité et de la durée |
| **Action** | un fait de jeu daté : but, tir, arrêt, défense, passe décisive, gardien en poste |
| **Action proposée / validée / corrigée / rejetée / ajoutée** | les états d'une action dans la supervision (voir `05-SUPERVISION.md`) |
| **Feuille de saisie** | l'objet UNO League qui reçoit les actions (`stat_sessions`), publié ensuite par l'admin |
| **Zone aveugle** | la partie du terrain que la caméra ne voit pas ; déclarée au calibrage |
| **Jeu d'or** (*golden set*) | des matchs entièrement revus par l'admin, qui servent d'étalon à chaque version de l'IA |
| **Campagne d'entraînement** | un ré-entraînement des modèles sur le jeu de données accumulé, suivi d'une évaluation sur le jeu d'or |

---

## Points à confirmer

Ces points ne bloquent pas la lecture, mais la documentation prend une
hypothèse pour chacun. Elle est indiquée ; à confirmer ou à corriger.

| # | Question | Hypothèse prise |
|---|---|---|
| 1 | Caractéristiques des caméras des centres : résolution, cadence, format d'export, image déjà « redressée » ou non | 1080p, 25 ou 30 images/s, fichier MP4 H.264, image brute fish-eye |
| 2 | Quelle partie du terrain manque sur les caméras de coin | le coin opposé à la caméra, sur quelques mètres |
| 3 | Système d'exploitation du PC qui porte la RTX 2070 Super | Windows 11, exécution native (pas de Docker GPU) |
| 4 | Qui annote les boîtes des images d'entraînement, avec quel temps hebdomadaire | l'admin, avec CVAT et des pré-annotations du modèle, environ 2 h par semaine au début |
| 5 | Fautes : acceptées en V2 exploratoire, faute de signal fiable sur le radar | oui |
| 6 | Modification du schéma UNO League : nouveaux types d'action (tirs) et table de métriques physiques | oui, dans le lot « V1-UNO » |
| 7 | Durée de conservation des vidéos brutes et politique pour les mineurs | 90 jours après publication ; pas de mineur sans accord parental écrit |
| 8 | Les trois couleurs de chasubles réellement utilisées, et la tenue de l'arbitre | rouge, bleu, vert ; arbitre en noir |
| 9 | Lisibilité des numéros de chasuble sur les caméras du centre (taille, contraste, devant et dos) | illisibles de loin : désignation manuelle en V1 |
| 10 | Le front-end de supervision ne tourne que sur le PC de l'admin | oui, en local |
