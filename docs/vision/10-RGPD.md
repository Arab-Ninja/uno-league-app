# Protection des données (RGPD)

Les joueurs sont filmés, suivis individuellement, et leurs performances
calculées. C'est un traitement de données personnelles au sens du RGPD, et
l'un des plus sensibles qu'une ligue amateur puisse faire. Ce document fixe
le cadre ; il est à relire avant la première vraie session, et à chaque
nouveau type de donnée.

---

## 1. Ce qui est traité

| Donnée | Nature | Où |
|---|---|---|
| vidéo brute de la session | image des joueurs, de l'arbitre, du public | PC de l'admin ; S3 si archivée |
| version 720p | idem | PC de l'admin |
| pistes et radar | positions en mètres, sans image | PC de l'admin |
| identités | numéro, compte UNO League | PC de l'admin, puis UNO League |
| actions et métriques | performances individuelles | PC de l'admin, UNO League, CSV |
| extraits d'entraînement | images annotées (boîtes) | PC de l'admin ; GPU loué si repli |

**Pas de biométrie.** Aucune reconnaissance faciale, aucun gabarit du visage
ni de la démarche n'est calculé (VIS-PER-009). L'identité repose sur la
chasuble et la désignation de l'admin. C'est ce qui garde le traitement hors
du régime des données biométriques (article 9), autrement interdit sans
exception stricte.

---

## 2. Base légale et information

- **Consentement** des joueurs, recueilli à l'inscription dans UNO League,
  distinct des conditions générales, retirable à tout moment. UNO League le
  prévoit ou l'ajoutera ; UNO Vision ne traite une session que si chaque
  participant identifié l'a donné. Un participant sans consentement est
  conservé comme « invité » anonyme sur la feuille (pas de nom, pas de
  métriques exportées).
- **Information sur place** : affiche à l'entrée du terrain indiquant que la
  session est filmée, par qui, pourquoi, pour combien de temps, et le contact
  pour exercer ses droits.
- **Public et arbitre** : filmés incidemment, non identifiés, non suivis hors
  du terrain. L'arbitre est détecté pour être exclu, jamais nommé.
- **Mineurs** : aucun mineur sans accord parental écrit. À défaut, le joueur
  est traité comme invité anonyme.
- **Caméras du centre** : les images appartiennent au centre, qui en est
  responsable de traitement. Un accord écrit avec chaque centre fixe ce qui
  est remis, à qui, et à quelles fins.

---

## 3. Conservation

| Donnée | Durée | Puis |
|---|---|---|
| vidéo brute et 720p | **90 jours** après la publication de la feuille dans UNO League | supprimée du PC et de S3 |
| pistes, radar, actions, métriques | durée de vie du compte du joueur dans UNO League | supprimées avec le compte |
| extraits d'entraînement annotés | tant qu'ils servent au jeu de données | retirés sur demande du joueur ; une campagne suivante ré-entraîne sans eux |
| jeu d'or | idem, limité à quelques matchs | — |

La suppression est **outillée** : l'écran Sessions montre la date de purge
de chaque vidéo, et un bouton « Retirer ce joueur » efface ses extraits du
jeu de données et marque ses métriques à supprimer dans UNO League.

---

## 4. Sécurité

- Tout tourne sur le poste de l'admin, non exposé au réseau
  (VIS-NF-005). Disque chiffré recommandé.
- S3 : compartiment privé, région Union européenne, préfixe dédié, accès par
  clés propres à UNO Vision, journalisé.
- Jeton UNO League limité au routeur `tracker`, révocable (VIS-INT-005).
- Location de GPU (repli) : uniquement avec un prestataire en Union
  européenne ou sous clauses contractuelles types, pour des campagnes
  d'entraînement, avec suppression des images à la fin ; jamais de vidéo
  entière, seulement les images annotées.

---

## 5. Droits des personnes

| Droit | Comment |
|---|---|
| accès | export des actions et métriques du joueur, depuis UNO League |
| rectification | la supervision corrige une identité ou une action ; UNO League rejoue la publication |
| effacement | « Retirer ce joueur » (§3) et suppression du compte UNO League |
| opposition, retrait du consentement | dans UNO League ; les sessions suivantes le traitent en invité anonyme |

Un registre des traitements (une page) décrit ce traitement, sa finalité
(statistiques sportives de la ligue), ses destinataires (l'admin, le joueur
pour ses propres données) et ces durées. Une analyse d'impact (AIPD) est
recommandée dès lors qu'on suit systématiquement des personnes : elle tient
en quelques pages et reprend ce document.
