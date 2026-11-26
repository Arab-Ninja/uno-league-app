# Salles omnisports : démarche, script d'appel et liste des salles

> Relevé du 26 novembre 2026, sur les sites des centres et des communes.
> Les tarifs et les contacts changent : chaque ligne se confirme au premier
> appel, et la colonne « Suivi » se tient à jour ici.

Les centres five (FitFive, CityFive…) se réservent par SportFinders, et la
démarche « 2b » de `courriels.txt` leur est destinée. Les **salles
omnisports** — parquet, polyuréthane ou linoléum, ADEPS devenue Forêt de
Soignes Sport, Mounier, XL Sports — sont moins chères et certains joueurs les
préfèrent. Elles posent deux problèmes : la réservation passe par des outils
peu commodes (BigCaptain surtout), et on n'y voit presque aucune
disponibilité.

---

## Ce qu'on a appris : pourquoi on ne voit rien en ligne

**Les créneaux en ligne ne sont pas les vraies disponibilités. Ce sont les
restes.** Les deux centres qui l'écrivent noir sur blanc :

- **Forêt de Soignes Sport** : « les réservations ponctuelles peuvent être
  réservées 14 jours à l'avance via notre application » ; pour un terrain
  « chaque semaine pour le même jour et la même heure », « contactez le
  service commercial ».
- **Mounier** : réservation ponctuelle sur BigCaptain, 14 jours à l'avance ;
  les locations récurrentes sont des **contrats à jour et heure fixes, de
  septembre à août**, signés avec le responsable commercial.

Les salles communales fonctionnent de la même façon, en plus strict : les
occupations à l'année se demandent au printemps pour la saison suivante
(Uccle : **avant mai**), les clubs et associations passent en priorité (à
Schaerbeek, la salle Van Oost leur réserve les soirées de semaine ; dans les
salles de la VGC, les associations reconnues ont la priorité jusqu'au 31
mai), et le reste part au cas par cas.

Conséquences :

1. **Il faut appeler le service commercial**, pas chercher plus longtemps sur
   BigCaptain. Ce qu'on voit en ligne, c'est ce qui reste après les contrats
   de saison, et seulement sur quatorze jours.
2. **La bonne demande est un créneau fixe**, pas une réservation ponctuelle :
   « un terrain chaque mardi de 21 h à 22 h, de janvier à juin ». C'est aussi
   ce qui sert le mieux la ligue : une séance qui sait où elle joue se remplit
   sans risquer de perdre le terrain pendant qu'elle se remplit.
3. **En cours de saison**, les créneaux réguliers qui se libèrent (un club qui
   arrête, une école qui part) ne passent pas toujours en ligne : demander à
   être prévenu.
4. **La saison 2027-2028 se joue au printemps 2027.** Noter dès le premier
   appel la date limite des demandes d'occupation annuelle de chaque salle.

---

## Ce qu'il faut savoir avant de proposer nos services

- **Ces centres sont publics ou para-publics.** XL Sports est une ASBL liée
  à la commune d'Ixelles ; Mounier, une ASBL au service de l'UCLouvain, de la
  Fédération Wallonie-Bruxelles et de la COCOF ; les autres, des services
  communaux. Une prestation informatique (site, application, réservation)
  passe en général chez eux par un **marché public**, même modeste : le
  gestionnaire ne peut pas signer un devis sur un rendez-vous. D'où le
  **diagnostic offert, sans prix** : il ouvre la porte sans rien leur
  demander, et s'il y a une suite, c'est à eux de dire sous quelle forme.
- **Ils ont un contrat avec leur outil** (BigCaptain, iClub). Ne pas dénigrer
  l'outil : parler de « votre parcours de réservation », de ce qui coûte du
  temps (appels, désistements, créneaux vides), et partir de ce qu'ils
  utilisent.
- **Filmer dans la salle** : nos séances finies montrent une vidéo. Dans une
  salle sans caméra, il faut poser la nôtre. C'est une autorisation à
  demander, au même titre que le référencement.

---

## L'ordre des démarches

| Étape | Quoi                                                                                                                                                  | Support                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1     | Appeler le **service commercial** (script ci-dessous) : obtenir un nom, les réponses sur les disponibilités, et l'accord pour envoyer la présentation | ce document                                 |
| 2     | Envoyer le courriel **2e** le jour même, avec le dossier à son nom                                                                                    | `courriels.txt` §2e, `docs/dossier-salles/` |
| 3     | Sans réponse après 8 à 10 jours : la **relance**, en réponse au premier courriel                                                                      | `courriels.txt`, RELANCE                    |
| 4     | Rendez-vous : l'application sur un téléphone, une séance terminée, et le diagnostic offert                                                            | le dossier, page 6                          |

Le dossier se personnalise par salle : le nom du centre apparaît sur la
couverture et dans les captures (`docs/dossier-salles/README.md`). Les trois
premières salles sont prêtes dans `salles.json` ; une salle de plus, c'est une
ligne dans ce fichier et deux commandes.

---

## Script d'appel

**À qui** : l'accueil, puis le service commercial ou le responsable des
locations régulières. Demander son nom et son adresse directe : le courriel
part à lui, pas à `info@`.

> Bonjour, je m'appelle Yassine Bakhtaoui, je dirige UNO League, une ligue de
> futsal amateur à Bruxelles. Nos joueurs aimeraient jouer chez vous, et
> j'aurais deux ou trois questions sur vos disponibilités. Est-ce que je
> m'adresse à la bonne personne pour les locations régulières ?

**Les questions, dans l'ordre :**

1. Les créneaux visibles en ligne (BigCaptain / SportFinders) sont-ils les
   seuls disponibles, ou d'autres se réservent-ils directement auprès de
   vous ?
2. Est-il possible de louer un **créneau fixe chaque semaine** d'ici la fin de
   la saison (janvier à juin) ? Quels jours et quelles heures restent libres,
   en semaine après 19 h en particulier ?
3. Quand un club ou une école libère un créneau régulier en cours de saison,
   comment l'apprend-on ? Peut-on être prévenus ?
4. Pour la saison 2027-2028 : **quand** faut-il faire la demande, et sous
   quelle forme (formulaire, contrat, courriel) ?
5. Le tarif d'un créneau régulier est-il le même que le tarif à l'heure, et
   comment se règle-t-il (à la réservation, au mois, sur facture) ?
6. Peut-on poser une caméra en hauteur (type GoPro, en tribune) pendant nos
   séances, pour en tirer la vidéo et les statistiques des joueurs ?

**Pour finir :**

> Nous avons une application qui organise tout cela, et nous aimerions vous
> présenter le projet : vous référencer comme lieu de jeu, et voir comment
> une collaboration pourrait vous être utile. Puis-je vous envoyer une
> présentation de quelques pages, à votre nom ? À quelle adresse ?

Noter les réponses dans la colonne « Suivi » du tableau ci-dessous.

---

## Les salles

Trois vagues, de la plus accessible à la plus administrative. La première
regroupe les centres qui vivent de leurs locations et ont un service
commercial : ce sont eux qui ont intérêt à remplir des créneaux. Les salles
communales viennent ensuite : elles sont moins chères, mais les créneaux se
demandent par formulaire, pour la saison.

### Vague 1 : les centres déjà repérés

| Salle                                                                                | Gestionnaire                                                          | Foot en salle                                                                                                                             | Réservation                                                                                               | Contact                                                                                       | Suivi |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----- |
| **Forêt de Soignes Sport** (ex-centre ADEPS), chaussée de Wavre 2057, 1160 Auderghem | non indiqué sur son site ; un annuaire cite l'ASEUS asbl, à confirmer | H1 : 88,50 €/h avant 17 h, 105 €/h après 17 h et le week-end · H3 : 48,50 € / 58,50 € (saison 2026-2027)                                  | appli en ligne (BigCaptain, iClub), ponctuel à 14 jours ; **créneaux hebdomadaires : service commercial** | 02 663 24 30 · info@csfds.be · formulaire « service commercial » de la page football en salle |       |
| **Centre sportif Mounier**, avenue Emmanuel Mounier 87, 1200 Woluwe-Saint-Lambert    | ASBL Mounier (UCLouvain, FWB, COCOF)                                  | halls 1, 2 et 3 ; hall 2 : 46,8 × 30 m, sol polyuréthane, 54,20 €/h avant 17 h, 73,60 €/h après 17 h et le week-end (24.08.26 → 22.08.27) | BigCaptain uniquement, 14 jours ; **contrats récurrents septembre → août : responsable commercial**       | David Mahé, responsable commercial : 02 777 13 02 · sport@mounier.be · accueil 02 762 85 22   |       |
| **XL Sports** (Centre sportif ixellois Albert Demuyter), rue Volta 18, 1050 Ixelles  | ASBL (BE 0421.374.532), site communal d'Ixelles                       | salle omnisports 40 × 24 m, linoléum, homologuée niveau national                                                                          | xlsports.be renvoie vers BigCaptain ; aussi sur SportFinders                                              | 02 515 69 10 ou 02 515 69 15 · csi.asbl@gmail.com · ouvert de 7 h à 23 h 30                   |       |

### Vague 2 : salles ouvertes au public, réservation directe

| Salle                                                                           | Gestionnaire                    | Foot en salle                                                                                   | Réservation                           | Contact                                                                                        | Suivi |
| ------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| **VUB, salle à parquet**, campus d'Etterbeek                                    | Vrije Universiteit Brussel      | salle à plancher bois ; 74 €/h pour les externes, en semaine de 8 h à 22 h                      | page « Rent VUB »                     | via vub.be (Sports VUB) · courriel en néerlandais ou en anglais (§2e NL)                       |       |
| **VUB / Basic-Fit, salle de Jette**                                             | VUB, exploitation Basic-Fit     | ~800 m², futsal (buts normaux) ou handball                                                      | tarif des externes fixé par Basic-Fit | via vub.be                                                                                     |       |
| **Centre sportif et culturel Pôle Nord**, chaussée d'Anvers 208, 1000 Bruxelles | Ville de Bruxelles, à confirmer | salle omnisports ; 20 €/h pour les Bruxellois, 40 €/h sinon (annonce SportFinders, à confirmer) | à l'accueil, pas en ligne             | 02 274 07 90                                                                                   |       |
| **Sportcity**, avenue Salomé 2, 1150 Woluwe-Saint-Pierre                        | commune de Woluwe-Saint-Pierre  | salle de sport et salle omnisports (futsal non confirmé)                                        | non trouvée en ligne                  | 02 773 18 20 · info@sportcity-woluwe.be · service des sports 02 773 07 83, sport@woluwe1150.be |       |

### Vague 3 : salles communales, demandes par formulaire

| Commune            | Salles                                                                  | Comment demander                                                                              | Contact                                       | Suivi |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- | ----- |
| Ville de Bruxelles | Rempart des Moines (35 × 21 m, futsal), Fontainas, Neder-over-Heembeek… | formulaire de demande, ponctuelle ou régulière                                                | infosport@brucity.be                          |       |
| Saint-Gilles       | Centre sportif communal, rue de Russie 41 (futsal)                      | téléphone ou courriel ; ouvert en semaine de 8 h à 23 h 45                                    | 02 536 03 86 · sport.1060@stgilles.irisnet.be |       |
| Uccle              | centres sportifs communaux                                              | demande au service des Sports ; **occupations permanentes avant mai** pour la saison suivante | sport@uccle.brussels                          |       |
| Anderlecht         | salles Simonet, Trèfles, Lemmens                                        | contrat signé ; le règlement vise d'abord ASBL, clubs et sociétés                             | sports@anderlecht.brussels · 02 800 07 00     |       |
| Molenbeek          | salle omnisports Louis Namêche                                          | 20 €/h pour les particuliers (grille communale non datée)                                     | service des sports                            |       |
| Jette              | Centre omnisports (RCA)                                                 | grille « particuliers » grande et petite salle (annexe du 1er juillet 2024)                   | régie communale autonome                      |       |
| Schaerbeek         | Hall sportif Van Oost (homologué futsal)                                | **soirées de semaine réservées aux clubs et associations** (17 h - 22 h 30)                   | service des sports                            |       |
| Ganshoren          | salles communales                                                       | portail ganshorensport.be                                                                     |                                               |       |
| Forest             | Complexe du Bempt, salles Primeurs et Van Volxem                        | service des sports                                                                            |                                               |       |
| Schaerbeek (VGC)   | Campus Kompas, Gallaitstraat 58-60 : 36 × 20 m, tracé futsal            | priorité aux associations reconnues par la VGC jusqu'au 31 mai                                | sporthal@campuskompas.brussels (§2e NL)       |       |

**Le revêtement compte pour les joueurs** : seule la salle de la VUB est
annoncée en parquet ; Mounier est en polyuréthane, XL Sports en linoléum. Le
demander au téléphone et le noter, c'est une information que l'application
pourra afficher.

---

## Sources

- Forêt de Soignes Sport : [football en salle](https://www.foretdesoignessport.be/footballensalle/), [accueil](https://www.foretdesoignessport.be/), [fiche sport.brussels](https://sport.brussels/infrastructures/centre-sportif-de-la-foret-de-soignes/), [ASEUS](https://www.aseus.be/complexe-sportif/centre-sportif-de-la-foret-de-soignes)
- Mounier : [foot en salle](https://www.mounier.be/sport/foot-en-salle/), [hall 2](https://www.mounier.be/infrastructure/hall-2/), [infos pratiques](https://www.mounier.be/infos-pratiques/), [BigCaptain](https://my.big-captain.com/site/mounier/home)
- XL Sports : [sport.brussels](https://sport.brussels/infrastructures/centre-sportif-ixellois-albert-demuyter/), [ixelles.be](https://www.ixelles.be/site/38-Centre-sportif-ixellois-Albert-Demuyter), [CompanyWeb](https://www.companyweb.be/en/0421374532/centre-sportif-ixellois-albert-demuyter), [SportFinders](https://www.sport-finder.com/en/center/xl-sports)
- VUB : [salle à parquet](https://www.vub.be/en/services-vub-campuses-in-etterbeek-and-jette/sports-vub/vub-sports-infrastructure-and-facilities/indoor-sports-hall-with-wooden-floor), [salle de Jette](https://www.vub.be/en/services-vub-campuses-in-etterbeek-and-jette/sports-vub/vub-sports-halls-in-jette/vub-basic-fit-sports-hall-in-jette), [Rent VUB](https://vub.be/en/services-vub-campuses-etterbeek-and-jette/sports-vub/practical-information-about-vub-sport/rent-vub)
- Pôle Nord : [SportFinders](https://www.sport-finder.com/en/center/centre-sportif-et-culturel-pole-nord)
- Sportcity : [woluwe1150.be](https://www.woluwe1150.be/en/culture-and-leasures/sports-en/), [sport.brussels](https://www.sport.brussels/en/infrastructures/sportcity/)
- Ville de Bruxelles : [installations sportives](https://www.bruxelles.be/installations-sportives), [Guide du sport 2025-2026](https://www.brussels.be/sites/default/files/bxl/Guide%20du%20Sport%202025-2026.pdf)
- Saint-Gilles : [centre sportif communal](https://stgilles.brussels/places/le-centre-sportif-communal/)
- Uccle : [règlement d'ordre intérieur des centres sportifs](https://www.uccle.be/sites/default/files/filemanager/Reg-Charte/Reglement-ordre-interieur-centres-sportifs-REGL_U1180_fr.pdf)
- Anderlecht : [règlement de location](https://www.anderlecht.be/sites/default/files/medias/Files/sport/R%C3%A9glement%2Bde%2Blocation%2B2021.pdf.pdf)
- Molenbeek : [grille de tarification](https://www.molenbeek.brussels/fr/fichiers/sport/fr-annexe-b.pdf)
- Jette : [tarifs RCA](https://cpas-jette.irisnet.be/pdf/reglements-taxes-et-redevances/occupation-de-salles-communales/sports-rca-tarifs-indexation-annexe.pdf)
- Schaerbeek : [hall Van Oost](https://access-i.be/en/buildings-sites/hall-sportif-de-schaerbeek-salle-van-oost), [Campus Kompas (VGC)](https://www.vgc.be/sites/vgc/files/2024-04/Sportzaal%20Campus%20Kompas%20Schaarbeek.pdf)
- Forest : [associations sportives](https://forestadm.irisnet.be/fr/services-communaux/sport/clubs-sportifs)
- Ganshoren : [répertoire Gazette de Bruxelles](https://www.gazette-de-bruxelles.be/guide-pratique-decouvrir-les-clubs-et-infrastructures-sportifs-par-commune-a-bruxelles/)
