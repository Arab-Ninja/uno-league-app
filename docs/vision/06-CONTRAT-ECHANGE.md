# Contrat d'échange avec UNO League

Ce document engage les deux applications. Il vit dans les deux dépôts, à
l'identique, et porte un numéro de version. Toute modification est
**additive** : un champ s'ajoute, ne se renomme ni ne disparaît.

Version du contrat : **1**.

---

## 1. Principes

| Principe | Conséquence |
|---|---|
| **UNO League est la source de vérité** des joueurs, des sessions et de la publication | UNO Vision lit l'effectif chez elle et ne publie jamais |
| **L'IA écrit comme un opérateur humain** | elle passe par le routeur `tracker` existant, avec les mêmes procédures et les mêmes contrôles |
| **Le canal principal est l'API ; le CSV est l'archive** | une session est envoyée par l'API dans une feuille en brouillon ; les CSV sont produits à chaque export, déposés en local et sur S3, et restent lisibles sans aucune des deux applications |
| **Idempotence** | chaque action porte un `clientId` stable ; renvoyer une session ne crée pas de doublon, UNO League garantit l'unicité en base |
| **L'humain publie** | l'admin ouvre `/admin/tracker` et publie ; ce qui s'applique ensuite (classement, XP, divisions) est le chemin existant |

---

## 2. Identifiants partagés

| Identifiant | Origine | Forme | Usage |
|---|---|---|---|
| `sessionRef` | UNO Vision | UUID | référence de la session analysée, inscrite dans le label de la feuille et le manifeste |
| `statSessionId` | UNO League | entier | la feuille créée ; mémorisée par UNO Vision pour les mises à jour |
| `playerId` | UNO League | entier | joueur ; `null` pour un invité, remplacé par `guestName` |
| `teamIndex` | les deux | 0, 1, 2 | position de l'équipe dans la session ; la couleur l'accompagne |
| `shirtNumber` | les deux | 1 à 5 | numéro de chasuble |
| `matchOrder` | les deux | entier à partir de 1 | rang du match dans la session |
| `clientId` | UNO Vision | `vis-` + UUID v4, 40 caractères | identifiant stable d'une action ; contrainte d'unicité `stat_events.client_id` |

Une action corrigée garde son `clientId`. Une action rejetée est transmise
dans `deletions`. Une action ajoutée par l'admin reçoit un `clientId` neuf au
moment de l'ajout.

---

## 3. Le flux API

Toutes les procédures citées existent déjà dans
`apps/api/src/trpc/routers/tracker.router.ts`, sauf celles marquées
**nouveau**. Le transport est tRPC sur HTTPS ; UNO Vision utilise un client
tRPC générique en Python (requêtes JSON sur `/trpc/<procédure>`).

```
UNO Vision                                             UNO League
   │                                                        │
   │ 1. tracker.players / tracker.recentRosters             │  lire l'effectif
   │ ──────────────────────────────────────────────────────►│
   │                                                        │
   │ 2. tracker.create {label, localDate, venueId, modeId}  │  la feuille, en brouillon
   │ ──────────────────────────────────────────────────────►│  (avec ses 3 équipes)
   │ ◄─── statSessionId, teamIds                            │
   │                                                        │
   │ 3. tracker.addParticipant ×N {teamId, playerId|guest,  │  l'effectif
   │                               shirtNumber}             │
   │ 4. tracker.addVideo ×V {label, url?}                   │  les repères vidéo
   │ 5. tracker.addMatch + updateMatch {teamA, teamB,       │  les matchs, coups
   │       videoId, videoStartMs, declaredScoreA/B}         │  d'envoi, scores relevés
   │ 6. tracker.sync {upserts[≤500], deletions[≤500]}       │  les actions, par lots
   │ ──────────────────────────────────────────────────────►│
   │ 7. tracker.upsertMetrics  (nouveau)                    │  physique, possession
   │                                                        │
   │                              admin : /admin/tracker ─► publier
```

**Mise à jour après corrections** : UNO Vision mémorise `statSessionId` et
les identifiants d'équipes, de participants, de vidéos et de matchs reçus ;
un second envoi rejoue 6 et 7 seuls (et 5 si un coup d'envoi a changé). Les
`clientId` inchangés sont des mises à jour, les rejets des suppressions.

**Authentification** — **nouveau** côté UNO League : un **jeton machine**.

- une variable d'environnement `VISION_API_TOKEN_HASH` (empreinte SHA-256
  du jeton) ; le jeton lui-même n'est connu que d'UNO Vision ;
- en-tête `Authorization: Bearer <jeton>` ; un `machineProcedure` qui
  l'accepte, limité au routeur `tracker` ;
- chaque écriture est journalisée dans `audit_logs` avec `actor = "vision"` ;
- révocation : changer la variable.

Le jeton ne donne aucun autre droit : ni publication, ni lecture des
comptes, ni boutique. La publication exige une session humaine d'admin.

---

## 4. Les actions

### 4.1 Types

| Type UNO Vision | Type UNO League | Points | Statut |
|---|---|---|---|
| `goal` | `goal` | 1,5 | existant |
| `own_goal` | `own_goal` | 0 | existant |
| `defense` | `defense` | 0,5 | existant |
| `save` | `save` | 0,5 | existant |
| `gk_in` | `gk_in` | 0 | existant |
| `shot_on_target` | `shot_on_target` | 0 | **nouveau** |
| `shot_off_target` | `shot_off_target` | 0 | **nouveau** |

Les passes, récupérations et reprises de jeu ne sont pas des actions
exportées : elles sont trop nombreuses et n'ont pas de place dans la feuille.
Elles comptent dans les métriques (§5).

### 4.2 Une action, en JSON

Le format transmis à `tracker.sync` est exactement `trackerEventSchema`
d'UNO League ; les champs d'UNO Vision qui ne s'y trouvent pas (confiance,
preuves, état) restent dans le CSV et le manifeste.

```json
{
  "clientId": "vis-5c6d6b2e-9a5f-4a0e-8f3e-2b1c0d9e8f7a",
  "matchId": 412,
  "type": "goal",
  "participantId": 1187,
  "assistParticipantId": 1190,
  "teamId": 303,
  "clockMs": 251400,
  "videoMs": 1873250
}
```

`participantId`, `teamId` et `matchId` sont ceux qu'UNO League a renvoyés
aux étapes 2 à 5. `clockMs` est l'horloge de match (depuis le coup d'envoi),
`videoMs` la position dans l'enregistrement désigné par `videoId` du match.

---

## 5. Les métriques — nouveau côté UNO League

Une table `stat_participant_metrics`, une ligne par participant et par match
(et une ligne de cumul par session avec `match_id` nul) :

| Colonne | Type | Unité | Sens |
|---|---|---|---|
| `session_id` | int | — | la feuille |
| `match_id` | int, nul pour le cumul | — | le match |
| `participant_id` | int | — | le joueur sur la feuille |
| `distance_m` | decimal | m | distance parcourue |
| `top_speed_kmh` | decimal | km/h | vitesse maximale (fenêtre 0,5 s) |
| `avg_speed_kmh` | decimal | km/h | vitesse moyenne en jeu |
| `max_accel_ms2` | decimal | m/s² | accélération maximale |
| `possession_ms` | int | ms | temps de possession |
| `passes` | int | — | passes tentées |
| `passes_completed` | int | — | passes réussies |
| `shots` | int | — | tirs |
| `shots_on_target` | int | — | tirs cadrés |
| `recoveries` | int | — | récupérations sans duel |
| `source` | varchar | — | `vision` |
| `model_version`, `rules_version` | varchar | — | traçabilité |
| `created_at`, `updated_at` | datetime | — | — |

Clé unique `(session_id, match_id, participant_id)`. Procédure
`tracker.upsertMetrics { sessionId, rows[] }`, `machineProcedure` et
`supervisorProcedure`. Aucun effet au classement : ces colonnes
s'affichent sur la feuille et la carte du joueur, et c'est tout.

À la publication, les métriques suivent la feuille vers la session publiée
(copie dans une table `match_player_metrics` liée à `matches`), pour que la
suppression d'une feuille ne les efface pas de l'historique du joueur. Ce
point est du ressort d'UNO League et se décide au lot V1-UNO.

---

## 6. Les fichiers CSV

Un dossier par export : `exports/<localDate>_<sessionRef>/`. UTF-8, virgule,
guillemets doubles au besoin, point décimal, dates ISO 8601, en-tête fixe.
Les fichiers sont déposés en local et, si configuré, sur S3 sous
`vision/exports/<localDate>_<sessionRef>/`.

### `manifest.json`

```json
{
  "contractVersion": 1,
  "sessionRef": "5c6d6b2e-…",
  "statSessionId": 87,
  "localDate": "2026-10-11",
  "venue": { "id": "yc-five", "name": "YC Five", "calibrationId": 3 },
  "versions": { "model": "rtdetr-r18-v3", "rules": "2026.10-a", "pipeline": "0.4.1" },
  "exportedAt": "2026-10-12T07:40:12Z",
  "review": { "proposed": 212, "validated": 170, "corrected": 21, "rejected": 18, "added": 3, "unreviewed": 0 },
  "warnings": ["match 2 : score déclaré 3–2, buts validés 3–1"]
}
```

### `matches.csv`

| colonne | type | sens |
|---|---|---|
| `match_order` | int | rang |
| `team_a_index`, `team_a_color`, `team_b_index`, `team_b_color` | int, texte | équipes |
| `score_a`, `score_b` | int | buts validés |
| `declared_score_a`, `declared_score_b` | int ou vide | score relevé |
| `video_label` | texte | repère de l'enregistrement du coup d'envoi |
| `kickoff_video_ms`, `end_video_ms` | int | positions dans la vidéo |
| `duration_ms` | int | durée retenue |
| `possession_a_pct`, `possession_b_pct` | decimal | possession |

### `events.csv`

| colonne | type | sens |
|---|---|---|
| `client_id` | texte | identifiant stable |
| `match_order` | int | — |
| `type` | texte | l'un des types du §4.1 |
| `team_index`, `team_color` | int, texte | équipe de l'auteur |
| `shirt_number` | int | auteur |
| `player_id` | int ou vide | compte UNO League de l'auteur |
| `guest_name` | texte ou vide | si invité |
| `assist_shirt_number`, `assist_player_id` | int ou vide | passeur (buts) |
| `clock_ms` | int | horloge de match |
| `video_label`, `video_ms` | texte, int | position dans l'enregistrement |
| `confidence` | decimal | 0 à 1 |
| `status` | texte | `validated`, `corrected`, `added` (les rejetées ne sont pas exportées) |
| `original_type` | texte ou vide | type proposé, si corrigé |
| `evidence` | texte | preuves, en une phrase |
| `flags` | texte | `blind_zone`, `height_unverified`, `ball_interpolated`, séparés par `|` |

### `player_match_stats.csv`

Une ligne par joueur et par match, plus une ligne `match_order = 0` pour le
cumul de session.

| colonne | sens |
|---|---|
| `match_order`, `team_index`, `team_color`, `shirt_number`, `player_id`, `guest_name` | identité |
| `goals`, `assists`, `defenses`, `saves`, `own_goals`, `shots`, `shots_on_target`, `conceded`, `goalkeeping_ms` | la feuille, telle qu'UNO League la calcule |
| `points` | barème officiel UNO League (1,5 / 1 / 0,5 / 0,5) |
| `passes`, `passes_completed`, `recoveries`, `possession_ms` | possession |
| `distance_m`, `top_speed_kmh`, `avg_speed_kmh`, `max_accel_ms2` | physique |
| `time_on_pitch_ms` | temps de présence |

### `team_match_stats.csv`

`match_order`, `team_index`, `team_color`, `goals`, `shots`,
`shots_on_target`, `passes`, `passes_completed`, `possession_pct`,
`distance_m`.

### Lecture par UNO League

UNO League n'a pas besoin de lire les CSV : l'API les lui a déjà donnés.
Un import CSV existera comme **secours** (feuille créée depuis
`events.csv` et `player_match_stats.csv`), pour une session exportée avant
que l'API ne soit disponible, ou pour rejouer une archive. Même procédure
de mise en correspondance : `player_id` → participant, `match_order` →
match, `client_id` → action.

---

## 7. Modifications côté UNO League (lot V1-UNO)

| Changement | Où | Nature |
|---|---|---|
| types `shot_on_target`, `shot_off_target` | `packages/shared/src/tracker.ts` (`TRACKER_EVENT_TYPES`, `TRACKER_ACTIONS` en non primaire), `apps/api/src/db/schema.ts` (`stat_events.type`), migration, `TrackerParticipantStats` (compteurs `shots`, `shotsOnTarget`, sans points), écran de saisie (colonne) | additif |
| jeton machine | `apps/api/src/trpc/init.ts` (`machineProcedure`), `apps/api/src/env.ts` (`VISION_API_TOKEN_HASH`), audit | nouveau |
| `tracker.upsertMetrics` et table `stat_participant_metrics` | routeur, service, schéma, migration | nouveau |
| affichage des métriques | feuille de saisie, carte joueur | nouveau, sans effet au classement |
| import CSV de secours | `tracker.importCsv` | nouveau, après le reste |
| consentement vidéo | inscription, profil ; champ `players.video_consent_at` | nouveau (`10-RGPD.md`) |

Rien de ce lot ne change le comportement d'une feuille saisie à la main.

---

## 8. Compatibilité

- `contractVersion` figure dans le manifeste et dans la réponse d'une
  nouvelle procédure `tracker.contractVersion` ; UNO Vision refuse d'envoyer
  vers une version qu'il ne connaît pas.
- Un champ inconnu dans un CSV est ignoré par le lecteur ; une colonne
  absente est une erreur. Ajouter est libre, retirer ne l'est pas.
- Les types d'action sont une liste fermée ; en ajouter un est une version
  de contrat.
