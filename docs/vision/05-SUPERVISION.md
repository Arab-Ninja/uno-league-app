# Supervision

L'écran de l'admin a un seul utilisateur et un seul objectif : **revoir vite
et bien** ce que l'IA propose, et faire de chaque geste de revue une donnée
d'apprentissage. Il reprend les réflexes de la saisie en visionnage d'UNO
League — un lecteur, un pavé d'actions, le clavier avant la souris — en
inversant le sens : l'IA propose, l'admin dispose.

Poste de travail : écran d'ordinateur, navigateur, en local. Pas de version
mobile.

---

## 1. Le parcours d'une session

```
 Nouvelle session ─► Vidéos ─► Salle et calibrage ─► Effectif ─► Analyse
                                                                     │
        Export ◄─ Statistiques ◄─ Revue des actions ◄─ Coups d'envoi ◄─ Identités
```

### Nouvelle session
Date, salle, mode (UNO League, amical…), couleurs des trois équipes choisies
parmi les préréglages d'UNO League (Rouge, Bleu, Vert, Jaune), score relevé
par match si l'admin l'a noté. La session est créée en brouillon ; tout le
reste se fait dans l'ordre qu'on veut.

### Vidéos
Glisser les fichiers. L'ingestion commence aussitôt (métadonnées, version
720p). L'ordre se règle par glissement ; un repère nommé par fichier
(« 1re heure »), comme dans UNO League.

### Salle et calibrage
Choix du calibrage existant de la salle. Le système compare les lignes de la
première image à l'image de référence et affiche *conforme* ou *la caméra a
bougé — recalibrer*. Le calibrage lui-même est décrit dans
`03-TOURNAGE-ET-CALIBRAGE.md`.

### Effectif
Importé d'UNO League : la session réservée correspondante, ou l'un des
derniers effectifs utilisés (`tracker.recentRosters`). Chaque joueur reçoit
son équipe et son numéro de 1 à 5. Un joueur absent de l'app s'ajoute comme
invité, à rattacher plus tard dans UNO League.

### Analyse
Un bouton. L'écran affiche la progression par étape, le temps restant
estimé, et les avertissements (ballon rarement vu, lignes décalées).
L'analyse tourne dans le worker : fermer le navigateur ne l'arrête pas.
Quand la détection est finie, les étapes suivantes se relancent seules à
chaque correction.

### Identités
Pour chaque match, le système présente une mosaïque : **une vignette par
piste** présente au coup d'envoi (image découpée, couleur d'équipe déduite),
et l'admin clique le numéro correspondant — ou le nom. Dix clics. Le système
propose déjà un numéro quand il l'a lu ; l'admin confirme.

En dessous, la liste des **reprises de piste** : chaque fois qu'une piste
s'est perdue puis qu'une nouvelle est apparue, la proposition d'identité et
sa raison (« même couleur, à 1,2 m de la dernière position de #7 bleu »).
Confirmer ou corriger. Une identité se corrige aussi **à partir d'un
instant** : « de 4:12 à la fin, cette piste est #3 rouge ».

L'arbitre est désigné de la même façon, une fois par session.

### Coups d'envoi
Pour chaque match : la vidéo, le bouton « Coup d'envoi ici », « Fin ici »,
les deux équipes et le but que chacune attaque (proposé d'après les
gardiens). Identique au geste actuel d'UNO League.

### Revue des actions
Le cœur de l'écran, décrit au §2.

### Statistiques
La feuille telle qu'UNO League la calculera : score, buts, passes, défenses,
arrêts, tirs, gardien, buts encaissés ; puis les métriques physiques et la
possession. Les avertissements de cohérence d'UNO League y sont déjà
(score déclaré ≠ buts déduits, équipe qui encaisse sans gardien).

### Export
Le compte des actions non revues, le choix *tout* ou *validées seulement*,
puis deux boutons : **Fichiers CSV** et **Envoyer vers UNO League**. Le
second crée ou met à jour la feuille de saisie en brouillon ; un lien ouvre
`/admin/tracker` dans UNO League pour publier.

---

## 2. La revue des actions

```
┌─────────────────────────────────────────┬──────────────────────────┐
│                                         │  RADAR (vue de dessus)   │
│            VIDÉO (720p)                 │  joueurs, ballon,        │
│       −5 s ◄──── action ────► +3 s      │  trajectoire du ballon   │
│                                         │  en surbrillance         │
├─────────────────────────────────────────┴──────────────────────────┤
│  ⏮  ◄◄ 2 s   ▶ / ❚❚   2 s ►►  ⏭        vitesse 0,25× … 2×          │
├────────────────────────────────────────────────────────────────────┤
│  DÉFENSE — #4 Rouge — 03:41 — confiance 0,62                        │
│  Preuves : ballon porté par #7 Bleu (03:39,2) · duel à 1,4 m ·      │
│  porté par #4 Rouge (03:40,1) · possession Rouge 2,8 s · ballon vu  │
│  à 71 %                                                             │
│                                                                    │
│  [V] Valider   [C] Corriger   [R] Rejeter   [A] Ajouter une action │
├────────────────────────────────────────────────────────────────────┤
│  Match 2 · 14 actions · 3 revues · tri : confiance croissante       │
│  ▸ 01:12 But #2 Bleu (0,94) ✓    ▸ 03:41 Défense #4 Rouge (0,62) ●  │
│  ▸ 02:05 Tir cadré #5 Bleu (0,81)  ▸ 05:30 Arrêt #1 Rouge (0,55) ▸…│
└────────────────────────────────────────────────────────────────────┘
```

**Un extrait par action.** La vidéo se cale 5 s avant l'action, le radar
suit en synchronisation, la trajectoire du ballon et les joueurs impliqués
sont surlignés. Les preuves se lisent en une ligne.

**Les gestes.**

| Geste | Effet | Devient |
|---|---|---|
| **Valider** | l'action est juste telle quelle | `validated` |
| **Corriger** | changer le type, l'auteur, le passeur, l'équipe ou l'instant ; l'original est conservé | `corrected` |
| **Rejeter** | il ne s'est rien passé, ou pas cela | `rejected` |
| **Ajouter** | une action manquée, à l'instant courant de la vidéo : joueur puis action, comme dans UNO League | `added` |

Une correction du type ouvre les champs utiles : un but demande le passeur,
un arrêt vise le gardien en poste, une défense n'a qu'un auteur.

**L'ordre de revue.** Par défaut, les actions les moins sûres d'abord, puis
par match et par horloge. Filtres : match, type, état, confiance. Un mode
**chronologique** lit le match du début à la fin, utile pour trouver les
actions manquées.

**Le clavier.** Les mêmes conventions qu'UNO League là où elles existent.

| Touche | Action |
|---|---|
| `Espace` | lecture / pause |
| `←` `→` | 2 s en arrière, en avant ; avec `Maj`, une image |
| `J` `K` | action précédente, suivante |
| `V` `C` `R` `A` | valider, corriger, rejeter, ajouter |
| `1` à `5` | numéro du joueur (dans un ajout ou une correction) |
| `Tab` | changer d'équipe |
| `B` `D` `S` `T` `G` | but, défense, arrêt, tir, gardien (type dans un ajout ou une correction) |
| `Ctrl+Z` | annuler le dernier geste |

**Ce qui est sauvegardé.** Chaque geste est écrit à l'instant où il est fait
(VIS-SUP-010). Chaque ligne de `event_reviews` garde l'action proposée,
l'action finale, le geste et la date : c'est **le jeu de données des
règles** (`07-DONNEES-ET-ENTRAINEMENT.md`).

---

## 3. Vérifications avant export

L'export n'est pas refusé, il est **informé** :

- actions non revues, par match ;
- écart entre score déclaré et buts validés (bloquant côté UNO League, comme
  aujourd'hui) ;
- identités encore proposées, non confirmées, qui portent des actions ;
- invités non rattachés (bloquant la publication, pas l'export) ;
- changements de gardien non revus.

---

## 4. Salles et calibrages

Liste des salles, leur gabarit, leurs calibrages (date, erreur de
reprojection, image de référence), et l'assistant décrit dans
`03-TOURNAGE-ET-CALIBRAGE.md`.

---

## 5. Tableau de bord de l'IA

Ce qui sert à l'améliorer, rien d'autre.

| Vue | Contenu |
|---|---|
| **Par type d'action** | précision, rappel, F1 ; courbe par session ; par salle ; par version de modèle et de règles |
| **Matrice de confusion** | type proposé × type final, pour voir ce que l'IA confond (tir non cadré ↔ passe, défense ↔ récupération) |
| **Confiance** | taux de validation par tranche de confiance : la confiance trie-t-elle bien ? |
| **Identités** | reprises de piste par match, part corrigée, changements d'identité |
| **Ballon** | part des images où il est vu, par salle et par session |
| **Temps de revue** | minutes par match, par session, dans le temps : l'indicateur produit |
| **Versions** | modèles et règles disponibles, promus, résultats sur le jeu d'or |

Les définitions exactes des métriques sont dans
`07-DONNEES-ET-ENTRAINEMENT.md`.

---

## 6. Jeu de données et campagnes

- **Images à annoter** : le système propose les images où il a douté
  (ballon perdu, détection faible, reprise de piste) ; l'admin les exporte
  vers CVAT, annote, réimporte.
- **Jeu d'or** : marquer une session comme « entièrement revue » l'y ajoute.
- **Campagne** : choisir un modèle de base, le jeu de données, lancer ; à la
  fin, le rapport d'évaluation sur le jeu d'or et un bouton **Promouvoir**.
  En ligne de commande en V1 si l'écran n'est pas prêt (VIS-SUP-009 est
  « souhaité »).

---

## 7. Temps de revue visé

Un match de 10 minutes produit de l'ordre de 40 à 80 actions proposées
(tirs et défenses compris). À 10 secondes par action, c'est 7 à 13 minutes :
la cible de 15 minutes à la première campagne (VIS-SUP-011). La cible
suivante, 5 minutes, suppose de ne revoir que les actions sous un seuil de
confiance, ce que le tableau de bord doit d'abord justifier.
