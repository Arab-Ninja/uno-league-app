# Exigences

Chaque exigence porte un identifiant stable, repris par le code, les tests et
le tableau de traçabilité à venir. La priorité suit trois niveaux :

| Priorité | Sens |
|---|---|
| **V1-obligatoire** | sans elle, la V1 n'est pas livrée |
| **V1-souhaité** | livrée en V1 si le suivi du ballon le permet ; sinon reportée sans bloquer |
| **V2** | hors V1, consignée pour que l'architecture ne la rende pas impossible |

Un critère d'acceptation accompagne chaque exigence : c'est ce qu'on vérifie
pour la déclarer tenue. Les seuils chiffrés des règles de jeu sont des
**valeurs par défaut**, réglables sans modifier le code (voir
`04-REGLES-DE-DEDUCTION.md`).

Préfixes : `IN` entrées, `TER` terrain, `PER` personnes, `BAL` ballon, `EVT`
actions, `PHY` données physiques, `SUP` supervision, `EXP` export, `INT`
intégration UNO League, `QUA` qualité de l'IA, `NF` non fonctionnel.

---

## 1. Entrées vidéo (IN)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-IN-001 | Le système accepte des fichiers MP4 ou MOV encodés en H.264 ou H.265, de 720p à 4K, de 24 à 60 images par seconde, fournis **en fichier ou par adresse URL** d'un MP4 (cas des caméras des centres). | V1-obligatoire | les fichiers des caméras du centre, leur adresse, et les fichiers d'une GoPro s'ouvrent sans conversion manuelle |
| VIS-IN-002 | Une session peut compter **plusieurs fichiers** (prise par match, découpage automatique de la caméra). Leur ordre est donné par l'admin. | V1-obligatoire | une session de trois fichiers produit une seule feuille, les actions de chaque fichier portent le bon repère vidéo |
| VIS-IN-003 | L'image peut être déformée par un objectif grand angle (fish-eye). La déformation est corrigée par le calibrage, jamais supposée absente. | V1-obligatoire | les lignes droites du terrain sont droites sur l'image redressée |
| VIS-IN-004 | Le système tolère une qualité médiocre : compression forte, flou de mouvement, éclairage inégal. Il signale ce qu'il ne voit pas plutôt que d'inventer. | V1-obligatoire | une image sans ballon visible produit « ballon non vu », pas une position |
| VIS-IN-005 | Les vidéos ne quittent pas le PC de l'admin pour être analysées. Le téléversement vers S3 est optionnel et sert à l'archivage. | V1-obligatoire | l'analyse fonctionne sans connexion sortante |
| VIS-IN-006 | Une version allégée (720p) de chaque vidéo est produite pour la lecture fluide dans l'écran de supervision. | V1-obligatoire | la navigation image par image répond en moins de 200 ms |

## 2. Terrain et calibrage (TER)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-TER-001 | Le terrain est décrit par un **gabarit paramétrique** : longueur, largeur, largeur des buts, surface de réparation, rond central, points de réparation. Les valeurs sont celles du futsal par défaut et surchargeables par salle. | V1-obligatoire | un gabarit par salle, modifiable sans code |
| VIS-TER-002 | Le calibrage d'une caméra fixe se fait **une fois par salle et par emplacement** : correction de la déformation, puis correspondance d'au moins six points cliqués sur une image avec leurs coordonnées sur le gabarit. | V1-obligatoire | erreur de reprojection moyenne inférieure à 0,30 m sur les points de contrôle |
| VIS-TER-003 | Le calibrage est enregistré, nommé, daté, et réutilisé automatiquement pour toute session de cette salle. | V1-obligatoire | la deuxième session dans une salle ne demande aucun clic de calibrage |
| VIS-TER-004 | Le système détecte qu'une caméra a bougé depuis son calibrage (lignes du terrain décalées) et le signale avant l'analyse. | V1-souhaité | un décalage de plus de 0,5 m sur les lignes déclenche l'alerte |
| VIS-TER-005 | La **zone aveugle** (partie du terrain hors champ) est déclarée au calibrage. Toute action dont le ballon s'y trouve est marquée « hors champ » et sa confiance abaissée. | V1-obligatoire | une action en zone aveugle apparaît avec ce drapeau dans la supervision |
| VIS-TER-006 | Le calibrage automatique à chaque image, pour une caméra qui bouge, n'est pas en V1. L'architecture isole le calibrage dans une étape remplaçable. | V2 | l'étape de calibrage expose la même sortie (homographie par image) quelle que soit sa méthode |

## 3. Personnes (PER)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-PER-001 | Chaque personne visible est détectée à chaque image traitée, y compris loin de la caméra (silhouette de **20 px** de haut : c'est la taille d'un joueur au fond du terrain sur une caméra de coin en 720p). | V1-obligatoire | rappel supérieur à 90 % sur le jeu de test de la salle, après la première campagne |
| VIS-PER-002 | Les détections sont reliées en **pistes** stables : une personne garde le même identifiant de piste tant qu'elle reste visible. | V1-obligatoire | moins de 5 changements d'identité par match de 10 minutes sur le jeu d'or |
| VIS-PER-003 | Seules les personnes **sur le terrain** sont suivies. Remplaçants, équipe en attente, spectateurs et personnel hors des lignes sont ignorés. | V1-obligatoire | aucune piste hors du polygone du terrain dans le radar |
| VIS-PER-004 | Les joueurs sont répartis en **deux équipes** par la couleur dominante de leur chasuble, parmi les couleurs déclarées pour la session. | V1-obligatoire | taux d'erreur d'équipe inférieur à 2 % des positions sur le jeu d'or |
| VIS-PER-005 | L'**arbitre** est reconnu comme tel et exclu des équipes et des statistiques. | V1-obligatoire | l'arbitre n'apparaît dans aucune action ni aucun total |
| VIS-PER-006 | Chaque piste reçoit une **identité** (numéro de chasuble, joueur UNO League) : proposée par le système, confirmée ou désignée par l'admin au début de chaque match, en un clic par joueur. | V1-obligatoire | dix identités désignées en moins de 90 secondes |
| VIS-PER-007 | Quand une piste se perd puis réapparaît, le système propose l'identité la plus probable (couleur, numéro s'il est lisible, continuité de position) et signale le doute. | V1-obligatoire | les reprises de piste apparaissent dans une liste à confirmer |
| VIS-PER-008 | Le **gardien** de chaque équipe est déduit de la position : le joueur qui tient le but. Un changement de gardien en cours de match produit une action « entre au but ». | V1-obligatoire | le gardien déduit correspond à la réalité sur 95 % du temps de jeu du jeu d'or |
| VIS-PER-009 | Aucune reconnaissance faciale, ni aucun gabarit biométrique, n'est calculé ni stocké. | V1-obligatoire | revue de code ; aucune dépendance de reconnaissance faciale |
| VIS-PER-010 | La lecture automatique du numéro de chasuble est tentée quand la résolution le permet, comme indice d'identité, jamais comme preuve. | V2 | — |

## 4. Ballon (BAL)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-BAL-001 | Le ballon est détecté à chaque image où il est visible, y compris petit (**5 px** en 720p au fond du terrain) et flou. Le ballon est détecté sur l'image **native**, jamais réduite, et suréchantillonnée si le rappel plafonne. | V1-obligatoire | rappel supérieur à 70 % des images où il est visible, après la première campagne ; 60 % accepté sur les caméras de coin en 720p |
| VIS-BAL-002 | Les trous de détection courts (occultation, flou) sont comblés par interpolation de trajectoire ; les trous longs restent des trous. | V1-obligatoire | aucune position interpolée au-delà de 1 s sans détection |
| VIS-BAL-003 | Chaque position de ballon porte un indicateur « vu » ou « interpolé », repris dans la confiance des actions. | V1-obligatoire | une action fondée sur un ballon interpolé affiche une confiance réduite |
| VIS-BAL-004 | La position du ballon est projetée au sol. Sa **hauteur n'est pas connue** en V1 ; les règles qui en dépendent (tir au-dessus de la barre) le disent. | V1-obligatoire | un tir cadré en 2D est présenté comme « cadré, hauteur non vérifiée » |
| VIS-BAL-005 | Une estimation de hauteur par la taille apparente et le mouvement vertical du ballon est étudiée. | V2 | — |

## 5. Possession et actions (EVT)

Les définitions complètes, avec leurs paramètres, sont dans
`04-REGLES-DE-DEDUCTION.md`. Les tableaux ci-dessous fixent **ce qui compte**.

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-EVT-001 | La **possession** est attribuée au joueur le plus proche du ballon, à moins de 1,0 m, pendant au moins 0,3 s. Sinon le ballon est libre ou en vol. | V1-obligatoire | la possession se lit sur le radar à chaque instant |
| VIS-EVT-002 | Une **passe** est un transfert de possession entre deux coéquipiers, le ballon ayant été en vol entre les deux. | V1-obligatoire | nombre de passes par joueur et par équipe |
| VIS-EVT-003 | Un **tir** est un ballon qui quitte son porteur vers le but adverse à plus de 35 km/h à moins de 12 m du but. Il est **cadré** si sa trajectoire au sol coupe la ligne de but entre les poteaux. | V1-obligatoire | tirs cadrés et non cadrés comptés par joueur |
| VIS-EVT-004 | Un **but** est un ballon qui franchit la ligne de but entre les poteaux, confirmé par au moins un signal : ballon immobilisé derrière la ligne, arrêt du jeu suivi d'un engagement au centre. | V1-obligatoire | précision supérieure à 90 % sur le jeu d'or |
| VIS-EVT-005 | Un **but contre son camp** est un but dont le dernier porteur appartient à l'équipe qui encaisse. | V1-obligatoire | distingué du but dans la feuille |
| VIS-EVT-006 | Le **score** de chaque match est la somme des buts déduits. Il est comparé au score déclaré par l'admin ; un écart est signalé, jamais corrigé en silence. | V1-obligatoire | identique au comportement actuel d'UNO League |
| VIS-EVT-007 | Une **passe décisive** est la dernière passe reçue par le buteur d'un coéquipier, achevée au plus **5 s** avant le but, sans possession adverse entre les deux. | V1-obligatoire | précision supérieure à 80 % sur le jeu d'or |
| VIS-EVT-008 | Un **arrêt** est un tir cadré repoussé ou capté par le gardien adverse, sans but dans les 2 s qui suivent. Seuls les tirs cadrés comptent. | V1-obligatoire | précision supérieure à 70 % sur le jeu d'or |
| VIS-EVT-009 | Une **défense réussie** est un transfert de possession de l'équipe A vers un joueur B, au contact (duel à moins de 2 m) ou par interception d'une passe, **suivi d'au moins 2 s de possession de l'équipe B**. Elle est créditée à B. | V1-obligatoire | précision supérieure à 60 % sur le jeu d'or à la première campagne, 75 % visée ensuite |
| VIS-EVT-010 | Une récupération après un arrêt du gardien, une sortie de balle ou un engagement n'est pas une défense. | V1-obligatoire | cas couverts par les tests de règles |
| VIS-EVT-011 | L'action **entre au but** est produite au début de chaque match pour chaque équipe, puis à chaque changement de gardien durable (plus de 20 s). | V1-obligatoire | le gardien en poste d'UNO League coïncide avec le radar |
| VIS-EVT-012 | Les **coups d'envoi** et fins de match sont posés par l'admin dans la vidéo, par match. L'horloge de match de chaque action en découle. | V1-obligatoire | identique au comportement actuel d'UNO League |
| VIS-EVT-013 | Chaque action porte une **confiance** entre 0 et 1 et des **preuves** lisibles : porteurs successifs, distances, vitesses, durées. | V1-obligatoire | la supervision affiche les preuves sous chaque action |
| VIS-EVT-014 | Les **fautes** ne sont pas déduites en V1 : le radar ne porte pas de signal fiable. Une approche par arrêt du jeu, position de l'arbitre et coup de sifflet est étudiée en V2. | V2 | — |
| VIS-EVT-015 | Les sorties de balle, corners, rentrées de touche et coups francs sont reconnus comme **reprises de jeu**, pour ne pas être comptés comme passes ou défenses. | V1-souhaité | une rentrée de touche ne produit ni passe ni défense |

## 6. Données physiques (PHY)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-PHY-001 | Pour chaque joueur et chaque match : **vitesse maximale**, **vitesse moyenne** (en jeu), **accélération maximale**, **distance parcourue**. Unités : km/h, m/s², m. | V1-obligatoire | présents dans le CSV et l'écran de session |
| VIS-PHY-002 | Les mêmes valeurs sont cumulées par session. | V1-obligatoire | — |
| VIS-PHY-003 | La vitesse maximale est la plus grande vitesse moyenne sur une fenêtre de 0,5 s, pour ne pas récompenser un saut de détection. | V1-obligatoire | — |
| VIS-PHY-004 | Les valeurs invraisemblables (vitesse supérieure à 32 km/h, accélération supérieure à 7 m/s²) sont signalées et exclues des maxima. | V1-obligatoire | signalées dans la supervision |
| VIS-PHY-005 | Précision visée : erreur inférieure à 15 % sur une course de référence mesurée au sol. | V1-obligatoire | test au jalon J2 avec un sprint chronométré sur distance connue |
| VIS-PHY-006 | La **possession** par équipe (en %) et par joueur (en secondes) est produite par match. | V1-souhaité | — |

## 7. Supervision (SUP)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-SUP-001 | L'admin crée une session, y attache les vidéos, choisit la salle (donc le calibrage), déclare les couleurs des équipes et l'effectif, importé d'UNO League ou saisi. | V1-obligatoire | parcours complet sans quitter l'application |
| VIS-SUP-002 | L'analyse se lance d'un bouton, affiche sa progression par étape et son temps restant estimé, et peut tourner sans que l'écran reste ouvert. | V1-obligatoire | fermer le navigateur n'interrompt pas l'analyse |
| VIS-SUP-003 | L'admin désigne l'identité de chaque piste au début de chaque match, et corrige une identité à partir d'un instant donné. | V1-obligatoire | voir VIS-PER-006 |
| VIS-SUP-004 | Chaque action proposée se **revoit** avec son extrait vidéo (5 s avant, 3 s après), le radar synchronisé et ses preuves. L'admin la **valide**, la **corrige** (type, auteur, passeur, équipe, instant), la **rejette**, ou **ajoute** une action manquée. | V1-obligatoire | les cinq gestes se font au clavier |
| VIS-SUP-005 | Les actions se filtrent par match, type, confiance, état. La revue par défaut présente d'abord les actions les moins sûres. | V1-obligatoire | — |
| VIS-SUP-006 | Rien n'est exporté vers UNO League tant qu'une action du match n'a pas été revue, sauf choix explicite d'exporter les seules actions validées. | V1-obligatoire | l'export affiche le compte des actions non revues |
| VIS-SUP-007 | Chaque correction conserve l'original proposé et la version finale : c'est le signal d'apprentissage. | V1-obligatoire | table des revues en base |
| VIS-SUP-008 | Un **tableau de bord** montre, par type d'action, par salle et par version de modèle : précision, rappel, taux d'accord, temps de revue, évolution dans le temps. | V1-obligatoire | voir `07-DONNEES-ET-ENTRAINEMENT.md` |
| VIS-SUP-009 | L'admin exporte le jeu de données d'entraînement et lance une campagne depuis l'application, ou en ligne de commande. | V1-souhaité | — |
| VIS-SUP-010 | L'avancement d'une revue est sauvegardé en continu ; recharger la page ne perd rien. | V1-obligatoire | — |
| VIS-SUP-011 | Le temps de revue visé est inférieur à 15 minutes par match de 10 minutes à la première campagne, 5 minutes ensuite. | V1-souhaité | mesuré par le tableau de bord |

## 8. Export (EXP)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-EXP-001 | Une session exportée produit un dossier de fichiers **CSV** : actions, statistiques par joueur et par match, statistiques par équipe, matchs, et un manifeste JSON (versions, dates, confiance moyenne). | V1-obligatoire | format décrit dans `06-CONTRAT-ECHANGE.md` |
| VIS-EXP-002 | Les CSV sont en UTF-8, séparateur virgule, en-tête fixe, dates ISO 8601, décimales avec un point. | V1-obligatoire | lisibles par un tableur et par UNO League |
| VIS-EXP-003 | Chaque action exportée porte un identifiant stable (`clientId`), identique d'un export à l'autre pour la même action. | V1-obligatoire | ré-exporter n'écrit jamais deux fois |
| VIS-EXP-004 | Les fichiers peuvent être déposés sur le S3 d'UNO League dans un préfixe dédié. | V1-souhaité | — |

## 9. Intégration UNO League (INT)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-INT-001 | UNO Vision lit l'effectif (joueurs, numéros, équipes récentes) depuis l'API UNO League avec un **jeton machine** dédié. | V1-obligatoire | aucun mot de passe humain dans UNO Vision |
| VIS-INT-002 | UNO Vision crée une **feuille de saisie en brouillon** dans UNO League (équipes, participants, vidéos, matchs, coups d'envoi, actions, scores déclarés) par les procédures existantes du routeur `tracker`. | V1-obligatoire | la feuille s'ouvre dans `/admin/tracker` comme si elle avait été saisie à la main |
| VIS-INT-003 | La **publication** reste faite dans UNO League par l'admin. UNO Vision n'y touche pas. | V1-obligatoire | aucune procédure de publication appelée |
| VIS-INT-004 | Un nouvel export après corrections **met à jour** la même feuille : mêmes `clientId`, suppressions transmises. | V1-obligatoire | pas de doublon après deux exports |
| VIS-INT-005 | Le jeton machine est limité au routeur `tracker`, audité, révocable. | V1-obligatoire | — |
| VIS-INT-006 | UNO League reçoit les nouveaux types d'action **tir cadré** et **tir non cadré**, sans poids au classement. | V1-obligatoire | migration et agrégation dans `packages/shared` |
| VIS-INT-007 | UNO League reçoit les **métriques physiques et de possession** dans une table dédiée, affichées mais sans effet au classement. | V1-souhaité | — |

## 10. Qualité de l'IA (QUA)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-QUA-001 | Toute analyse enregistre la version du modèle de détection, celle des règles et celle du calibrage utilisés. | V1-obligatoire | visible sur chaque action |
| VIS-QUA-002 | Un **jeu d'or** d'au moins cinq matchs entièrement revus, sur au moins deux salles, sert d'étalon. Toute nouvelle version y est évaluée avant d'être promue. | V1-obligatoire | rapport d'évaluation par version |
| VIS-QUA-003 | Deux analyses de la même vidéo avec les mêmes versions produisent les mêmes actions. | V1-obligatoire | test de reproductibilité |
| VIS-QUA-004 | Les métriques sont celles définies dans `07-DONNEES-ET-ENTRAINEMENT.md` : précision, rappel, F1 par type ; matrice de confusion ; erreurs d'identité ; temps de revue. | V1-obligatoire | — |

## 11. Non fonctionnel (NF)

| Id | Exigence | Priorité | Acceptation |
|---|---|---|---|
| VIS-NF-001 | Une session de 2 h est analysée en **moins de 12 h** sur une RTX 2070 Super (8 Go) ; cible : moins de 4 h. | V1-obligatoire | mesure au jalon J0 |
| VIS-NF-002 | Les étapes coûteuses (détection, suivi) sont **persistées** ; une correction d'identité, de coup d'envoi ou de seuil relance les seules étapes aval, en quelques secondes à quelques minutes. | V1-obligatoire | modifier un seuil ne relance pas la détection |
| VIS-NF-003 | Aucune dépendance sous licence **AGPL** ou interdisant un usage commercial fermé. La liste des licences est tenue dans `02-ARCHITECTURE.md`. | V1-obligatoire | contrôle automatique des licences en CI |
| VIS-NF-004 | Interface en **français**. Textes isolés dans des fichiers de traduction, par cohérence avec UNO League. | V1-obligatoire | — |
| VIS-NF-005 | Un seul utilisateur, l'admin, en local. Pas d'authentification multi-utilisateur en V1, mais l'application n'est jamais exposée hors du poste. | V1-obligatoire | écoute sur `localhost` uniquement par défaut |
| VIS-NF-006 | Installation documentée en moins d'une heure sur Windows et Linux, avec vérification du GPU. | V1-obligatoire | guide d'installation testé |
| VIS-NF-007 | Les secrets (jeton UNO League, S3) sont dans l'environnement, jamais dans le code ni dans la base. | V1-obligatoire | — |
| VIS-NF-008 | Journalisation de chaque analyse : durées par étape, versions, avertissements. | V1-obligatoire | — |
