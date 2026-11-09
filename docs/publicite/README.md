# Publicité « Tu restes ? »

Film de 53 secondes en 16:9, entièrement généré : images et plans sur
Higgsfield, voix off et musique comprises. Le montage, les cartons et le
mixage se font ici, en deux commandes.

Le parti pris est celui des grandes pubs de football : une nuit de pluie, une
salle municipale, des amateurs filmés comme des pros, une voix off qui parle
peu, une musique qui s'arrête net, puis un carton noir. Ce qui est emprunté,
c'est le **langage** (cadrages serrés, ralentis, grain, bandes cinéma, montage
sur les temps forts). Rien d'autre : aucun logo, slogan, sportif ou visuel
d'une autre marque. Les prompts l'exigent, et chaque plan a été contrôlé image
par image (voir « Ce qui a été écarté »).

---

## L'idée : la règle de la ligue devient la question

Une séance UNO League, c'est trois équipes de cinq, des matchs de dix minutes,
et **le vainqueur reste sur le terrain**. Le film déroule cette règle, puis la
retourne vers le spectateur : rester sur le terrain, rester dans la ligue.

Chaque réplique s'appuie sur une règle réelle de l'application :

| Réplique                                         | Ce qu'elle dit de la ligue                           |
| ------------------------------------------------ | ---------------------------------------------------- |
| « Ici… personne ne connaît ton nom. »            | on vient seul, l'app trouve l'équipe                 |
| « Tout le monde commence en bas. Division trois. » | toute carte joueur démarre en D3                   |
| « Trois équipes. Dix minutes. »                  | le format d'une séance                               |
| « Celui qui gagne… reste. » / « Les autres regardent. » | le vainqueur reste, l'entrant reste en cas de nul |
| « Chaque arrêt compte. » / « Chaque but compte. » | les stats de la feuille de match font le classement |
| « Cinq montent. Cinq descendent. »               | chaque séance clôturée déplace dix joueurs          |
| « Et ta carte… n'oublie rien. »                  | la carte joueur évolue avec les stats               |
| « La semaine prochaine, tout se rejoue. »        | sans engagement, une séance après l'autre           |
| « Alors… tu restes ? »                           | l'appel à l'action                                  |

Carton de fin : l'écusson, « UNO LEAGUE », la devise du flyer « Joue. Grimpe.
Gagne. », puis « Futsal 5 contre 5 · Bruxelles · unoleague.be ».

## Le découpage

| Temps   | Plan | Image                                         | Son                                  |
| ------- | ---- | --------------------------------------------- | ------------------------------------ |
| 0:00    | s01  | rue pavée, pluie, un tram passe               | VO 1                                 |
| 0:03,7  | s02  | lacets, vestiaire carrelé                     | VO 2                                 |
| 0:06,5  | s03  | la chasuble orange, regard caméra             | premier impact musical               |
| 0:09,5  | s04  | la salle : trois équipes, l'une attend        | VO 3                                 |
| 0:13,5  | s05  | coup d'envoi au ras du sol                    | second impact, sifflet               |
| 0:16,1  | s06  | dribble semelle                               | VO 4, le rythme démarre              |
| 0:19,1  | s07  | le banc des blancs, qui attend                | VO 5                                 |
| 0:21,7  | s08  | plongeon du gardien, ralenti                  | VO 6                                 |
| 0:24,0  | s09  | la frappe, sur le temps fort                  | VO 7                                 |
| 0:25,9  | s13  | le ballon fonce vers l'objectif               |                                      |
| 0:27,3  | s10  | la célébration                                |                                      |
| 0:30,3  | —    | cartons D3, D2, D1 (D1 en orange)             | VO 8                                 |
| 0:33,8  | s11  | assis contre le mur, le téléphone             | VO 9                                 |
| 0:37,8  | s12  | seul au rond central, la salle s'éteint       | **la musique se coupe net** — VO 10  |
| 0:45,1  | —    | « ALORS, TU RESTES ? »                        | VO 11, dans le silence               |
| 0:47,3  | —    | carton de fin                                 | impact final                         |

Le découpage exact (points d'entrée, durées, ancrage des répliques) vit dans
`EDL` et `VO`, en tête de `monte.py`.

## La fabrication

| Étape          | Outil Higgsfield                       | Réglages                          |
| -------------- | -------------------------------------- | --------------------------------- |
| Personnage     | `nano_banana_pro`                      | 2k, 16:9                          |
| 13 images clés | `nano_banana_pro`, personnage en référence | même suffixe de style partout |
| 13 plans       | `kling2_6`, image de départ            | 5 s (10 s pour s12), son natif    |
| Voix off       | `elevenlabs_v4`, voix « Luc »          | une réplique par fichier          |
| Musique        | `elevenlabs_music_v2_5`                | 55 s, instrumentale               |

Tous les prompts et tous les identifiants de génération sont dans
`plans.json` : on peut retrouver chaque fichier dans la bibliothèque
Higgsfield, ou régénérer un plan à l'identique.

Coût total : **197 crédits** (abonnement Starter), essais compris.

### Ce qui a été écarté, et pourquoi

- **Kling 3.0 « pro »** : réservé à l'abonnement Plus.
- **Kling 3.0 standard** : sort en 720p, et a ajouté de lui-même un logo
  de marque sur les shorts pendant le mouvement : exclu pour une pub.
  Kling 2.6 sort en 1080p, sans logo, avec une caméra plus nerveuse. Tous les
  prompts d'animation portent désormais la consigne « plain and unbranded, no
  logos anywhere ».
- **Le premier banc** : cinq joueurs presque identiques. Refait avec cinq
  profils distincts, plus fidèle à une salle bruxelloise.
- **s09 au-delà de 2 s** : une petite marque apparaît sur une chaussette ; le
  montage s'arrête avant.

## Refabriquer le film

Le dossier de travail `docs/publicite/rendu/` est ignoré par git : vidéos,
voix et musique ne sont pas versionnées.

```bash
# 1. Télécharger depuis Higgsfield (identifiants dans plans.json) :
#    rendu/vid/s01.mp4 … s13.mp4, rendu/aud/vo01.mp3 … vo11.mp3,
#    rendu/aud/music_a.mp3

# 2. Retirer les silences de tête et de queue de chaque réplique
cd docs/publicite/rendu/aud
for f in vo*.mp3; do
  ffmpeg -v error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse" -ar 48000 -ac 2 "${f%.mp3}.wav"
done
cd -

# 3. Les cartons (polices de l'app, écusson de docs/branding), puis le film
python3 docs/publicite/cartons.py docs/publicite/rendu/cards
python3 docs/publicite/monte.py docs/publicite/rendu
```

Le film sort dans `rendu/out/uno-league-pub-16x9.mp4` : H.264 1080p 24 i/s,
AAC 256 kb/s, −14 LUFS (la norme des plateformes), environ 40 Mo. Le rendu
prend trois à quatre minutes, surtout pour le grain.

Demande ffmpeg (testé en 6.1) et Pillow. Les polices sont lues directement
dans `apps/web/public/fonts` : Barlow Condensed ExtraBold pour les titres,
Barlow pour le reste, sous licence OFL.

## Pistes

- **Version 9:16** pour Reels et TikTok : recadrer le 16:9 coupe les plans
  larges (la salle, le banc). Mieux vaut régénérer les plans en 9:16 depuis
  les mêmes images clés recadrées : environ 140 crédits.
- **Version courte de 15 s** : s03, s05, s09, s13, s10, cartons D3 → D1,
  question, fin.
- **Voix off** : « Luc » est une voix française de synthèse. Une vraie voix
  bruxelloise, même enregistrée au téléphone, donnerait plus d'ancrage local ;
  `monte.py` la prend telle quelle si les fichiers gardent leurs noms.
