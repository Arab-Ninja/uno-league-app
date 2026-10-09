# Règles de déduction

Les actions ne sont pas « reconnues » : elles sont **déduites** du radar par
des règles écrites noir sur blanc. Ce document est leur définition de
référence. Le code les implémente une par une, les tests les vérifient sur
des radars synthétiques, et la supervision affiche pour chaque action les
preuves que la règle a retenues.

Trois principes :

1. **Tout en mètres et en secondes**, dans le repère du gabarit de terrain.
   Jamais en pixels : une règle ne dépend ni de la caméra ni de la salle.
2. **Chaque seuil est un paramètre** du fichier `rules.yaml`, versionné.
   Changer un seuil ne touche pas au code et se trace dans chaque action.
3. **Une règle dit ce qu'elle a vu**. Elle renvoie une confiance et des
   preuves, jamais un verdict nu.

---

## 1. Le radar, et ce qu'on en tire

À chaque image traitée `t`, pour chaque identité `i` sur le terrain :
position `p_i(t)` en mètres, vitesse `v_i(t)` (dérivée de la position
lissée). Pour le ballon : position `b(t)`, drapeau `vu(t)` (détecté ou
interpolé), vitesse `v_b(t)`.

Pour chaque match : les deux équipes `A` et `B`, le but que chacune attaque,
l'instant du coup d'envoi `t0` et de la fin `t1`. L'**horloge de match** d'un
instant vidéo est `t − t0`, bornée à `[0, durée]`, exactement comme
`matchClockFromVideo` dans UNO League.

Notation des buts : `G_A` est le but qu'attaque A (défendu par B). La
**ligne de but** de `G_A` est le segment entre ses deux poteaux ; la **zone
de filet** est le rectangle derrière cette ligne, de la profondeur du but
(1 m par défaut).

---

## 2. Possession

| Paramètre | Défaut | Sens |
|---|---|---|
| `possession.radius_m` | 1,0 | distance maximale ballon–joueur pour « tenir » le ballon |
| `possession.min_s` | 0,3 | durée minimale pour qu'une possession commence |
| `possession.release_radius_m` | 1,5 | au-delà, le porteur a lâché le ballon (hystérésis) |
| `possession.flight_speed_kmh` | 15 | au-dessus, et sans porteur, le ballon est *en vol* |

À chaque instant, le ballon est dans l'un de trois états :

- **porté** par `i` : `i` est le joueur le plus proche, à moins de
  `radius_m`, depuis au moins `min_s`. Il le reste tant qu'il est à moins de
  `release_radius_m` et qu'aucun autre joueur n'est plus proche depuis
  `min_s`.
- **en vol** : aucun porteur, vitesse au-dessus de `flight_speed_kmh`.
- **libre** : aucun porteur, ballon lent.

La **possession d'équipe** est celle du porteur ; en vol, elle reste à la
dernière équipe porteuse jusqu'à ce qu'un adversaire le porte. Le temps de
possession par joueur et par équipe s'en déduit par simple somme.

L'arbitre n'est jamais porteur : ses contacts fortuits sont ignorés.

Quand le ballon est **interpolé** (non vu) pendant un duel, la possession est
marquée *incertaine* ; toute action qui en dépend hérite de cette incertitude.

---

## 3. Passe

Une **passe** de `i` vers `j`, coéquipiers : possession de `i`, puis ballon
en vol ou libre pendant moins de `pass.max_flight_s` (3 s), puis possession
de `j`, sans possession adverse entre les deux.

Une **passe ratée** : même début, mais le porteur suivant est adverse (c'est
l'*interception* du §8), ou le ballon sort du terrain.

Les passes ne sont pas exportées comme actions vers UNO League (trop
nombreuses) ; elles alimentent les métriques (passes tentées, réussies) et
servent aux règles suivantes.

---

## 4. Tir

| Paramètre | Défaut |
|---|---|
| `shot.min_speed_kmh` | 35 |
| `shot.max_distance_m` | 12 |
| `shot.cone_deg` | 25 |
| `shot.on_target_margin_m` | 0,3 |

Un **tir** de `i` (équipe A) : `i` était porteur, le ballon part en vol à
plus de `min_speed_kmh`, depuis moins de `max_distance_m` du but `G_A`, et
sa direction initiale est dans un cône de `cone_deg` autour de la direction
du centre de `G_A`.

Il est **cadré** si la droite de sa trajectoire au sol (moyennée sur les
premières images du vol) coupe la ligne de but de `G_A` entre les poteaux,
élargie de `on_target_margin_m` de chaque côté. Sinon **non cadré**.

**La hauteur n'est pas connue** (VIS-BAL-004). Un tir qui passe au-dessus de
la barre est, en 2D, cadré. La règle le dit : un tir cadré dont le ballon
ne finit ni dans le filet ni repoussé près du gardien reçoit une confiance
réduite et la mention « hauteur non vérifiée ». La supervision tranche.

Un tir est une action à part entière, exportée vers UNO League
(`shot_on_target`, `shot_off_target`), sans points au classement.

---

## 5. But

| Paramètre | Défaut |
|---|---|
| `goal.line_margin_m` | 0,2 |
| `goal.net_dwell_s` | 0,8 |
| `goal.restart_window_s` | 60 |
| `goal.restart_radius_m` | 3 |
| `goal.stop_speed_kmh` | 4 |

Un **but pour A** : le ballon franchit la ligne de but de `G_A` entre les
poteaux, de l'avant vers l'arrière, et **au moins un** signal de confirmation
suit :

- **filet** : le ballon reste dans la zone de filet au moins `net_dwell_s`,
  ou y disparaît (dernière position vue dans la zone) ;
- **engagement** : dans les `restart_window_s` suivantes, la vitesse
  médiane des joueurs tombe sous `stop_speed_kmh` puis le ballon est porté
  au rond central (à moins de `restart_radius_m` du centre) avec les deux
  équipes dans leur moitié.

Avec les deux signaux, confiance haute. Avec un seul, moyenne. Sans aucun,
pas de but : la trajectoire seule, souvent interpolée près du but, ne suffit
pas.

L'**auteur** est le dernier porteur avant le franchissement. S'il appartient
à l'équipe qui encaisse, c'est un **but contre son camp** (VIS-EVT-005) ;
sinon un but. Un ballon dévié par un défenseur après un tir reste au tireur,
sauf si le défenseur en a eu la possession (§2).

Le **score** est la somme des buts déduits, par équipe, dans l'ordre de
l'horloge. Il est comparé au score déclaré par l'admin ; l'écart est un
avertissement bloquant, comme dans UNO League (`checkMatch`).

Un but dans la **zone aveugle** se détecte presque toujours par le seul
signal *engagement* : il est proposé avec l'auteur « inconnu » à désigner.

---

## 6. Passe décisive

| Paramètre | Défaut |
|---|---|
| `assist.max_delay_s` | 5 |

Pour un but de `s` à l'instant `t_g` : la dernière **passe** (§3) reçue par
`s`, d'un coéquipier `p`, achevée à `t_p` avec `t_g − t_p ≤ max_delay_s`, et
sans possession adverse entre `t_p` et `t_g`. Le passeur est `p`.

Pas de passe décisive sur un but contre son camp, ni sur un but après
récupération directe d'un adversaire.

---

## 7. Arrêt

| Paramètre | Défaut |
|---|---|
| `save.window_s` | 1,5 |
| `save.gk_radius_m` | 1,5 |
| `save.no_goal_after_s` | 2 |

Un **arrêt** du gardien `g` (équipe B) : un **tir cadré** de A (§4) ; puis,
dans les `window_s` qui suivent, le ballon change nettement de direction ou
s'arrête à moins de `gk_radius_m` de `g` (repoussé ou capté) ; et aucun but
pour A n'est déduit dans les `no_goal_after_s` suivantes.

Seuls les tirs cadrés comptent. Un tir non cadré touché par le gardien est
une parade sans valeur au classement : signalé dans les preuves, non exporté.

Si le gardien repousse et qu'un but suit dans la fenêtre, c'est un but, pas
un arrêt. Si le ballon ne fait que passer près du gardien sans changer de
direction, ce n'est rien (ou un but, si la ligne est franchie).

`g` est le **gardien en poste** de B à cet instant (§9). Un joueur de champ
qui repousse sur sa ligne un tir cadré n'obtient pas un arrêt : la statistique
appartient au gardien par définition dans UNO League. Il obtient une
**défense** si les conditions du §8 sont réunies.

---

## 8. Défense réussie

| Paramètre | Défaut |
|---|---|
| `defense.duel_radius_m` | 2,0 |
| `defense.keep_s` | 2,0 |
| `defense.exclusion_after_restart_s` | 3 |

Une **défense** de `d` (équipe B) : la possession passe d'un joueur `a`
(équipe A) à `d`, par l'un des deux chemins :

- **duel** : à l'instant du transfert, `a` et `d` sont à moins de
  `duel_radius_m` l'un de l'autre ;
- **interception** : le ballon était en vol depuis `a` vers un coéquipier, et
  `d` le porte avant lui.

Et l'équipe B **garde le ballon au moins `keep_s`** après le transfert :
possession de B (n'importe quel joueur, en vol compris) continue, sans
possession de A. Une récupération suivie d'une perte immédiate n'est pas une
défense réussie, c'est un duel.

**Exclusions** (VIS-EVT-010) :

- le transfert suit un **arrêt** du gardien de B (c'est l'arrêt qui compte) ;
- le ballon est sorti du terrain, ou le transfert a lieu dans les
  `exclusion_after_restart_s` qui suivent une reprise de jeu ;
- le transfert suit un but (engagement).

Une récupération sans duel ni interception — un ballon mal contrôlé par A et
ramassé par B à 5 m — est comptée comme **récupération** dans les métriques,
pas comme défense. Le fichier de règles permet de l'inclure si la ligue le
décide (`defense.count_loose_balls: false`).

C'est la règle la plus dépendante du suivi du ballon : au cœur d'un duel, le
ballon est caché, sa position interpolée. La confiance en tient compte, et la
revue des défenses est, à la première campagne, le poste de supervision le
plus chargé.

---

## 9. Gardien en poste

| Paramètre | Défaut |
|---|---|
| `gk.window_s` | 60 |
| `gk.area_margin_m` | 1,0 |
| `gk.change_min_s` | 20 |

À chaque instant, pour chaque équipe, le **gardien** est le joueur qui, sur
la fenêtre glissante `window_s`, a passé le plus de temps dans sa propre
surface de réparation (élargie de `area_margin_m`), avec un poids double
quand l'adversaire a la possession.

Au coup d'envoi, le gardien initial est celui des trente premières secondes :
il produit l'action **entre au but** (`gk_in`) à l'horloge 0. Quand le
gardien calculé change et que le nouveau le reste au moins `change_min_s`,
une nouvelle action `gk_in` est produite à l'instant du changement.
L'ancien gardien n'a rien à faire : UNO League déduit le temps de garde et
les buts encaissés de la succession des `gk_in`.

Un changement de gardien est toujours soumis à la revue : c'est une action
rare, qui pèse sur les buts encaissés de deux joueurs.

---

## 10. Reprises de jeu

Pour ne pas compter une rentrée de touche comme une passe, ni un dégagement
comme une interception, les **reprises de jeu** sont reconnues : le ballon
sort du terrain (position au-delà des lignes de plus de 0,5 m, ou disparu en
bordure), ou s'immobilise plus de 2 s avec les joueurs à l'arrêt, puis
repart d'un joueur.

Entre la sortie et la reprise, aucune passe ni défense n'est déduite ; la
possession repart à l'équipe qui reprend. Les corners, touches et coups
francs ne sont pas distingués en V1 (VIS-EVT-015 reste « souhaité ») ; leur
seule fonction est d'exclure.

---

## 11. Données physiques

| Paramètre | Défaut |
|---|---|
| `physical.smooth_window_s` | 0,5 |
| `physical.max_speed_kmh` | 32 |
| `physical.max_accel_ms2` | 7 |
| `physical.min_step_m` | 0,05 |

Pour chaque identité et chaque match, entre coup d'envoi et fin :

- **vitesse instantanée** : norme de la dérivée de la position lissée
  (fenêtre `smooth_window_s`), en km/h ;
- **vitesse maximale** : maximum de la vitesse moyenne sur `smooth_window_s`
  (VIS-PHY-003) ;
- **vitesse moyenne** : distance parcourue divisée par le temps de présence
  sur le terrain ;
- **accélération maximale** : maximum de la dérivée de la vitesse lissée,
  en m/s² ;
- **distance** : somme des déplacements supérieurs à `min_step_m` (sous ce
  pas, c'est du bruit de détection, pas du mouvement).

Toute valeur au-dessus de `max_speed_kmh` ou `max_accel_ms2` est
**exclue** du maximum et signalée : elle vient d'un saut de piste, pas d'un
joueur. Un joueur hors du terrain (banc) n'accumule rien.

Le ballon a sa propre vitesse, utilisée par les règles de tir et de passe,
non exportée.

---

## 12. Confiance

Chaque action reçoit une confiance entre 0 et 1, produit de trois facteurs :

| Facteur | Ce qu'il mesure |
|---|---|
| **visibilité** | part des positions du ballon *vues* (non interpolées) dans la fenêtre de l'action |
| **marge** | à quelle distance des seuils la règle a tranché : un tir à 36 km/h quand le seuil est 35 est fragile, un tir à 70 ne l'est pas |
| **identité** | la piste de l'auteur est-elle désignée, confirmée, ou proposée automatiquement |

Et deux pénalités : zone aveugle, et but confirmé par un seul signal.

La confiance n'est pas une probabilité calibrée ; c'est un **ordre de
revue**. La supervision présente d'abord ce qui est le moins sûr, et le
tableau de bord vérifie, campagne après campagne, que la confiance et le
taux de validation vont bien dans le même sens.

---

## 13. Modes de défaillance connus

| Situation | Effet | Parade |
|---|---|---|
| ballon caché dans un duel | possession interpolée, défense douteuse | confiance réduite ; revue ; ré-entraînement du détecteur ballon sur ces images |
| lob au-dessus de la barre | tir « cadré » à tort, puis ni but ni arrêt | mention « hauteur non vérifiée » ; V2 : estimation de hauteur |
| deux joueurs qui se croisent | échange d'identité entre pistes | liste des reprises de piste à confirmer ; V2 : ré-identification par apparence |
| chasubles proches | équipe fausse | avertissement au calibrage des couleurs ; imposer des trios sûrs |
| coin aveugle | auteur inconnu | drapeau « hors champ », auteur à désigner |
| rentrée de touche | passe ou interception fictive | reprises de jeu (§10) |
| ballon de rechange sur le bord | deuxième ballon détecté | seul le ballon sur le terrain compte ; en cas de doute, le plus proche d'un joueur |
| gardien qui monte en attaque (futsal) | changement de gardien fictif | `change_min_s` ; revue obligatoire des `gk_in` |
| caméra qui a bougé | tout le radar décalé | contrôle des lignes avant l'analyse (VIS-TER-004) |

---

## 14. Apprendre les règles

Les règles sont déterministes, mais leurs seuils s'apprennent. Après chaque
campagne de revue, un outil parcourt une grille de valeurs pour chaque
paramètre et retient, type par type, celle qui maximise le F1 sur les
actions validées, sous contrainte que la précision des buts ne baisse pas.
Le fichier de règles produit est **versionné** et évalué sur le jeu d'or
avant d'être promu, exactement comme un modèle.

En V2, un classificateur (gradient boosting) entraîné sur les attributs que
les règles calculent — distances, vitesses, durées, visibilité — prendra la
décision finale pour les défenses et les arrêts, là où les seuils fixes
plafonnent. Les règles resteront son filet : ce qu'il propose sans qu'aucune
règle n'ait rien vu est présenté comme tel.
