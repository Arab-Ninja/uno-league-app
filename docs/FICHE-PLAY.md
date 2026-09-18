# Fiche Google Play — textes et réponses

Tout ce que la console réclame, prêt à copier. Les passages entre crochets sont
les seuls à compléter : ils dépendent de votre structure juridique, que le code
ne connaît pas.

L'**ordre** dans lequel remplir tout cela est dans `LANCEMENT.md` ; ici, il n'y
a que les textes et les réponses.

Les réponses au questionnaire « Sécurité des données » sont **dérivées du
schéma de la base**, pas devinées. Une déclaration inexacte est un motif de
retrait de l'application, et c'est le formulaire où l'on se trompe le plus
facilement — on y déclare volontiers ce qu'on croit collecter plutôt que ce que
le code collecte.

---

## Identité de l'application

| Champ | Valeur |
|---|---|
| Nom (30 caractères max) | `UNO League` |
| Nom du package | `app.unoleague.mobile` |
| Catégorie | Sports |
| Type | Application (pas un jeu) |
| Gratuite / payante | Gratuite, avec paiements dans l'application |

---

## Description courte (80 caractères max)

```
Organisez vos séances de futsal, payez votre place et suivez votre classement.
```

*78 caractères.* C'est le texte affiché sous le nom dans les résultats de
recherche : il doit dire ce que l'application fait, pas ce qu'elle promet.

---

## Description complète (4 000 caractères max)

```
UNO League est l'application de votre ligue de futsal amateur. Elle remplace
les groupes de discussion, les tableurs partagés et les rappels de paiement par
un seul endroit où tout se décide.

PROPOSER ET REJOINDRE UNE SÉANCE

Choisissez une salle, une date, un créneau : la proposition est ouverte. Les
autres joueurs s'inscrivent. Dès que le plateau est complet, la séance passe en
réservation et chacun règle sa place. Personne n'a plus à relancer qui que ce
soit.

Un joueur n'a pas payé dans les temps ? Sa place devient accessible aux
remplaçants inscrits sur la liste d'attente. Une séance ne tombe plus à cause
d'un seul absent.

PAYER SA PLACE

Par carte bancaire, Apple Pay, Bancontact, ou avec vos points UNO. Chaque
mouvement apparaît dans votre portefeuille, avec sa raison. Un remboursement
est toujours visible : rien ne disparaît sans explication.

VOTRE CARTE DE JOUEUR

Photo, poste, nationalité, note générale. Elle évolue à chaque séance : buts,
passes, arrêts, interceptions. Le cadrage de la photo se règle directement sur
la carte, et le détourage du fond se fait sur votre téléphone — votre visage
n'est envoyé nulle part.

CLASSEMENT ET DIVISIONS

Trois divisions. À la clôture d'une séance, les premiers montent, les derniers
descendent. L'homme du match, le meilleur buteur et le meilleur défenseur sont
désignés d'après la feuille de match, pas d'après une impression.

CLUBS

Fondez un club, recrutez, alimentez une caisse commune. Défiez un autre club,
négociez la mise, composez votre cinq. Le vainqueur remporte la mise des deux
camps. Un marché des transferts permet d'attirer un joueur — à condition qu'il
soit d'accord : les deux clubs s'entendent, le joueur tranche.

TOURNOIS

Huitièmes, quarts, demi-finales. Les clubs s'engagent, le tableau se tire, et la
dotation revient à la caisse du vainqueur.

BOUTIQUE

Équipement de la ligue, échangeable contre vos points UNO. Vous pouvez aussi
reverser vos points à une association partenaire.

ARBITRES

Un compte arbitre suit ses propres statistiques et perçoit une indemnité par
séance dirigée.

RESTER AU COURANT

L'application vous signale ce qui vous concerne : une séance confirmée, un
paiement attendu, une place qui se libère. Rien d'autre, jamais de promotion.

—

UNO League est conçue pour une ligue réelle, qui se joue dans une vraie salle.
Les points UNO servent à réserver un terrain physique : ce ne sont ni une
monnaie, ni un bien numérique consommable dans l'application.

Inscription réservée aux personnes majeures.
```

---

## ⚠️ Notifications : ce que la fiche ne doit pas promettre

La WebView Android n'implémente pas l'API Push : `PushManager` y est absent,
même si les service workers sont pris en charge. L'application empaquetée
**n'affiche donc aucune notification système**. Le code le détecte et masque le
réglage plutôt que d'exposer un bouton sans effet.

Ce qui fonctionne malgré tout :

- les notifications **dans** l'application — le fil d'évènements, partout ;
- le **push véritable** pour qui ouvre le site en PWA : Chrome sur Android, ou
  iPhone avec l'application ajoutée à l'écran d'accueil.

D'où la formulation « L'application vous signale » plutôt que « vous êtes
prévenu » dans la description : la première est vraie dans les deux cas, la
seconde promet une alerte système que la version Android ne délivre pas.

Annoncer une fonctionnalité absente est un motif de rejet, et surtout une
déception pour le joueur qui l'aura cherchée. Le jour où le push natif sera
ajouté — un greffon Capacitor et Firebase Cloud Messaging —, la phrase pourra
redevenir explicite.

---

## Visuels

Prêts dans `apps/web/assets/store` :

| Élément | Fichier | Format imposé |
|---|---|---|
| Icône | `icone-512.png` | 512×512 PNG, sans transparence |
| Bandeau | `bandeau-1024x500.png` | 1024×500 |

**Captures d'écran** — à produire, deux minimum, huit maximum. Le plus simple :
ouvrir le site sur votre téléphone, l'ajouter à l'écran d'accueil, et
photographier l'écran. Les quatre qui racontent le mieux l'application :

1. l'accueil, avec la prochaine séance ;
2. le calendrier, avec une proposition ouverte ;
3. une carte de joueur ;
4. le classement d'une division.

Évitez d'y faire figurer des noms de joueurs réels tant que vous n'avez pas leur
accord.

---

## Politique de confidentialité

Adresse à déclarer :

```
https://unoleague.be/confidentialite.html
```

Le domaine répond, certificat compris. **Reprenez l'adresse dans la console
Play tant que l'application est en test interne** : c'est une mise à jour de
fiche aujourd'hui, et une reprise de bien plus d'éléments une fois en
production.

Elle est versionnée dans `apps/web/public/confidentialite.html` et suit donc
chaque déploiement. Le responsable du traitement y est identifié —
VIP Drivers SRL, siège à Ternat, BE 0744.534.881 —, ce que Google ne vérifie
pas mais que le RGPD exige.

Deux points à reprendre plus tard :

- **le siège déménage à Londerzeel.** Le jour où le changement est acté à la
  BCE, la ligne du responsable du traitement et la date de mise à jour en haut
  de page changent ensemble. Une politique qui désigne un siège périmé désigne
  mal le responsable, et c'est ce qu'un contrôle vérifie en premier ;
- **l'adresse de contact est personnelle.** Une adresse dédiée — `contact@`
  sur le domaine de la ligue — vaudrait mieux : elle survit à un changement de
  personne et ne publie pas une adresse privée sur une page que tout le monde
  peut lire. Voir DEPLOIEMENT §3, « Nom de domaine propre ».

---

## Questionnaire « Sécurité des données »

### Préambule

- Les données sont-elles **chiffrées en transit** ? → **Oui** (HTTPS).
- L'utilisateur peut-il **demander la suppression** de ses données ? → **Oui**,
  par e-mail au contact indiqué dans la politique.

### Données collectées

Toutes sont **collectées**, **liées à l'identité de l'utilisateur**, et
**non partagées** avec des tiers à des fins propres. Aucune n'est utilisée pour
de la publicité ni pour du suivi.

| Catégorie Google | Type | Obligatoire ? | Finalité déclarée |
|---|---|---|---|
| Informations personnelles | Nom | Oui | Fonctionnalité de l'application, Compte |
| Informations personnelles | Adresse e-mail | Oui | Fonctionnalité, Compte, Communications |
| Informations personnelles | Adresse postale | Non | Fonctionnalité (livraison boutique) |
| Informations personnelles | Autres (date de naissance, nationalité) | Oui | Fonctionnalité (contrôle de majorité) |
| Photos et vidéos | Photos | Non | Fonctionnalité (carte de joueur) |
| Messages | Autres messages dans l'application | Non | Fonctionnalité (discussions de club) |
| Informations financières | Historique d'achat | Oui | Fonctionnalité (registre des places et commandes) |
| Activité dans l'application | Interactions | Oui | Fonctionnalité (statistiques, classement) |
| Identifiants | ID d'appareil | Non | Fonctionnalité (notifications) |

### Ce qu'il ne faut **pas** déclarer

- **Informations de paiement** — les numéros de carte sont saisis chez Stripe.
  L'application n'en reçoit jamais aucun chiffre ; seuls le montant et une
  référence de transaction sont conservés.
- **Données biométriques** — l'analyse du visage pour cadrer et détourer la
  photo s'exécute sur l'appareil, avec des modèles embarqués. Aucune mesure du
  visage n'est transmise ni conservée.
- **Position** — jamais demandée. Les salles sont choisies dans une liste.
- **Contacts, agenda, SMS, fichiers** — jamais lus.

Ces quatre points méritent d'être répétés dans les **notes pour l'évaluateur** :
une application de sport qui prend des photos et encaisse de l'argent attire
l'attention, et une explication fournie d'avance évite un aller-retour.

---

## Classification du contenu

Questionnaire IARC. Les réponses attendues pour cette application :

- Violence, sexualité, langage grossier, drogues → **Non** à tout.
- **Les utilisateurs peuvent-ils communiquer entre eux ?** → **Oui** :
  discussions de club et négociations de transfert. Le déclarer est
  indispensable ; l'omettre est un motif de retrait.
- **L'application partage-t-elle la position de l'utilisateur ?** → Non.
- **Achats numériques ?** → Oui, achats dans l'application.

Classification attendue : **PEGI 3 / Tout public**.

---

## Notes pour l'évaluateur

```
Compte de démonstration :
  e-mail : [à créer, un compte joueur ordinaire]
  mot de passe : [mot de passe]

UNO League organise des séances de futsal dans des salles physiques.

Sur les paiements : les points UNO servent à réserver un créneau dans une salle
réelle. Ce n'est ni une monnaie, ni un bien numérique consommé dans
l'application — c'est un service du monde réel.

Sur la caméra : l'accès sert uniquement à prendre la photo de la carte de
joueur. L'analyse du visage (cadrage et détourage) s'exécute intégralement sur
l'appareil, avec des modèles embarqués dans l'application. Aucune image ni
donnée biométrique n'est transmise pendant cette opération ; seule la photo
finale, validée par l'utilisateur, est envoyée.

Sur les notifications : elles annoncent la confirmation d'une séance, l'attente
d'un paiement et la libération d'une place. Aucune notification promotionnelle.
```

---

## Ordre de publication

1. **Test interne** — jusqu'à 100 testeurs, mise à jour en minutes, pas de revue
   complète. C'est là qu'on envoie les premières versions.
2. **Test fermé** — un compte développeur **personnel** doit y passer : au moins
   douze testeurs pendant quatorze jours consécutifs avant de pouvoir demander
   l'accès à la production. Un compte **organisation** en est dispensé.
   Vérifiez la règle en vigueur dans la console, Google l'ajuste.
3. **Production** — irréversible : une version publiée ne se retire pas, elle se
   remplace.

À chaque envoi, `versionCode` doit augmenter dans
`apps/web/android/app/build.gradle`. Play refuse un paquet dont le numéro n'a
pas bougé.
