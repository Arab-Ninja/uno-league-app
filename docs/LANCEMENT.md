# Lancement

**Ce document donne l'ordre des choses.** `DEPLOIEMENT.md` explique comment
tout fonctionne, `FICHE-PLAY.md` contient les textes à recopier dans la console
Google : ici, il n'y a que la suite des gestes, numérotés, avec pour chacun qui
le fait, combien de temps il prend, et à quoi on voit qu'il est terminé.

Deux mentions reviennent partout :

- **[Vous]** — une action dans un navigateur, une console, ou Android Studio.
- **[Moi]** — une modification du code. Elle est soit déjà faite, soit à
  demander en une phrase.

Les blocs à recopier sont donnés **seuls**. Tout ce qui les entoure est de
l'explication : ne la collez nulle part.

---

## Où on en est

*Mis à jour le 19 septembre 2026.*

| Chantier | État |
|---|---|
| Code | 602 tests verts, dernière version sur `main` |
| Site et API | en ligne sur Render, `unoleague.be` avec certificats |
| Courrier | opérationnel (Brevo) — mot de passe oublié testé et reçu |
| Notifications | Web Push et push natif vérifiés de bout en bout sur un appareil |
| Pages publiques | confidentialité et suppression de compte en ligne, déclarées à Play |
| Google Play | compte **Organisation**, fiche complète, paquet fonctionnel en test interne |
| App Store | D-U-N-S obtenu, adhésion demandée — le projet iOS attend le compte |
| Dossier de présentation | version 8 prête, il part **après** les stores |

Les phases 0, A et B sont donc faites. Ce qui reste commence à la phase C.

---

## Trois choses avancent en parallèle

1. **Les délais administratifs** (phase 0) — numéro D-U-N-S, compte Apple.
   Quelques clics aujourd'hui, puis plusieurs jours d'attente pendant lesquels
   vous ne pouvez rien accélérer. C'est pour cela qu'ils passent en premier,
   alors même que l'App Store vient en dernier.
2. **Android** (phases A à C) — une demi-journée de travail, puis des délais
   imposés par Google.
3. **iOS** (phase D) — rien ne peut commencer avant que le compte Apple existe.

Le dossier de présentation (phase E) part quand les deux applications sont
publiques : montrer deux liens de store vaut mieux que promettre deux dépôts.

---

## Phase 0 — À lancer aujourd'hui : ce sont des délais, pas du travail

### 0.1 [Vous] Faire en sorte que `contact@unoleague.be` reçoive du courrier — 15 min

Aujourd'hui, l'adresse **envoie** (par Brevo) mais rien ne prouve qu'elle
**reçoive** : chez EasyHost, l'hébergement de courrier affichait « Boîtes de
courriel 0/0 ».

Chez EasyHost, dans la gestion du domaine `unoleague.be`, section
**Hébergement d'e-mail** :

- s'il existe une entrée **Redirections** (ou *Aliases*, *Forwarders*) :
  créez-en une de `contact@unoleague.be` vers votre adresse personnelle. C'est
  gratuit et suffisant ;
- sinon, prenez la plus petite boîte proposée.

Vérification : envoyez-vous un message à `contact@unoleague.be` depuis une
autre adresse. Il doit arriver en moins de deux minutes.

Pourquoi maintenant, et pourquoi c'est la toute première étape : cette adresse
est déjà publiée dans la politique de confidentialité, où le RGPD en fait le
point de contact pour toute demande de suppression. Elle servira aussi de
contact dans les deux consoles de store, et d'identifiant Apple à l'étape 0.4.
Une adresse publiée qui ne reçoit rien est un manquement, pas un détail.

### 0.2 [Vous] Relever le type du compte Google Play — 5 min

Console Play → **Paramètres** → **Détails du compte développeur** → *Type de
compte*.

Il dit **Personnel** ou **Organisation**. Notez lequel : c'est ce qui décide de
la durée de la phase C.

- **Organisation** → vous pouvez demander la production dès que le test interne
  vous satisfait.
- **Personnel** → Google impose un test fermé avec **au moins 12 testeurs
  inscrits pendant 14 jours consécutifs** avant d'autoriser la production. Ce
  compteur ne démarre qu'une fois les 12 testeurs réellement inscrits : il faut
  donc commencer à les recruter **maintenant**, pas dans trois semaines.

Si c'est « Personnel », faites dès aujourd'hui la liste de douze joueurs prêts
à installer l'application et à la laisser sur leur téléphone deux semaines.
Douze adresses Gmail : c'est la seule chose que Google regarde.

### 0.3 [Vous] Trouver, ou demander, le numéro D-U-N-S de VIP Drivers SRL — 10 min, puis 1 à 5 jours ouvrés

Apple n'inscrit une société au programme développeur que si elle possède un
numéro D-U-N-S. Il est gratuit.

Page de recherche Apple :

```
https://developer.apple.com/enroll/duns-lookup/
```

Renseignez la dénomination légale exacte (**VIP Drivers**), la Belgique, et
l'adresse du siège telle qu'elle figure à la BCE — aujourd'hui encore
Assesteenweg 116A, 1740 Ternat.

- **Numéro trouvé** → notez-le, passez à 0.4.
- **Rien trouvé** → le même formulaire permet d'en demander un. Comptez 1 à 5
  jours ouvrés ; Apple annonce jusqu'à 14 dans les cas lents. Vous recevrez le
  numéro par courrier électronique.

Pourquoi une société plutôt qu'un compte personnel : le nom affiché sous
l'application dans l'App Store est celui du titulaire du compte. « VIP Drivers
SRL » est cohérent avec la politique de confidentialité, avec le dossier de
présentation et avec les factures. Un compte personnel afficherait votre nom, et
le transfert ultérieur vers la société est une procédure distincte, à demander
à Apple.

### 0.4 [Vous] Adhérer à l'Apple Developer Program — 30 min, puis 1 à 7 jours

```
https://developer.apple.com/programs/enroll/
```

Dans l'ordre :

1. un identifiant Apple avec **double authentification activée** — prenez-en un
   dédié à la ligue, sur `contact@unoleague.be` (d'où l'étape 0.1), et non
   votre identifiant personnel ;
2. type d'entité : **Company / Organization** ;
3. le numéro D-U-N-S de 0.3, la dénomination légale, le numéro d'entreprise
   `BE 0744.534.881`, et le site `https://unoleague.be` ;
4. déclarez avoir le pouvoir d'engager la société — c'est le cas en tant que
   gérant ;
5. **99 € par an**, par carte.

Apple vérifie ensuite l'existence de la société, parfois par un appel
téléphonique au numéro public de l'entreprise. Tant que cette vérification
n'est pas passée, **rien de la phase D n'est possible** : ni créer la fiche, ni
signer un binaire, ni ouvrir TestFlight.

**Quand ces quatre points sont lancés, passez à la phase A sans attendre les
réponses.** Elles arriveront pendant qu'Android avance.

---

## Phase A — Un paquet Android qui fonctionne (une demi-journée)

### A.1 [Moi] `versionCode` — tenu à jour de mon côté

`apps/web/android/app/build.gradle`. Google Play refuse un paquet dont le
numéro n'a pas augmenté : je l'incrémente donc à chaque livraison qui appelle
un nouveau paquet, plutôt que de vous laisser le découvrir au moment de
l'envoi.

Rien à faire de votre côté, sinon le `git pull` de A.3 — et le faire **avant**
de construire, faute de quoi le paquet porte l'ancien numéro et la console le
refuse.

### A.2 [Vous] Vérifier `CORS_ORIGINS` sur Render — 5 min

Render → le service **API** → *Environment* → la variable `CORS_ORIGINS`. Sa
valeur doit être exactement :

```
https://unoleague.be,https://www.unoleague.be,https://uno-league-app.onrender.com,capacitor://localhost,https://localhost,http://localhost
```

Des virgules, aucune espace, aucune barre oblique finale. Si vous la modifiez,
Render redéploie tout seul ; attendez le point vert avant A.6.

Les trois dernières entrées sont les origines que les WebView donnent à
l'application empaquetée : Android annonce `https://localhost`, iOS
`capacitor://localhost`. Sans elles, l'application native est refusée par
l'API avec un message qui ne parle que d'origine — c'est exactement la panne
que nous avons déjà eue sur le site.

### A.3 [Vous] Reconstruire l'application avec l'adresse de l'API — 10 min

À la racine du dépôt, dans PowerShell :

```powershell
git checkout main
git pull
pnpm install
```

Puis :

```powershell
cd apps\web
$env:VITE_API_URL="https://unoleague.be"
pnpm build
pnpm exec cap sync android
```

Et la vérification qui évite de refaire tout le parcours pour rien :

```powershell
Select-String -Path dist\assets\*.js -Pattern "unoleague\.be" -List
```

Elle doit afficher **au moins une ligne**. Si elle n'affiche rien, la variable
n'a pas été prise : la fenêtre PowerShell a été fermée entre les deux blocs, ou
`$env:VITE_API_URL` a été saisi après `pnpm build`. Recommencez le second bloc
en entier dans la même fenêtre.

`cap sync android` recopie le build web dans le projet natif. C'est **lui** qui
embarque la nouvelle version : l'oublier republie l'ancienne, sans aucun
avertissement. Il reconstruit aussi les descripteurs de greffons, qui ne sont
pas versionnés : sur une machine qui vient de cloner le dépôt, il passe donc
**avant** l'ouverture d'Android Studio, sans quoi Gradle s'arrête sur
`project ':capacitor-android' not found`.

### A.4 [Vous] Produire le paquet signé — 20 min

```powershell
pnpm exec cap open android
```

Android Studio s'ouvre. Laissez-le finir sa synchronisation Gradle — la barre
de progression en bas — avant de toucher aux menus.

Puis **Build → Generate Signed App Bundle / APK** → **Android App Bundle** →
*Next*.

- **Si Play App Signing est déjà activé et que vous avez déjà une clé**
  (c'est le cas si vous avez envoyé le premier paquet) : reprenez le **même
  fichier `.jks`** et les mêmes mots de passe. Play refuse un paquet signé
  d'une autre clé.
- **Si vous n'avez pas de clé** : *Create new…*, choisissez un chemin **hors du
  dépôt** (par exemple `C:\Users\<vous>\Documents\uno-league.jks`), une validité
  de 25 ans ou plus.

> **Perdre cette clé, c'est perdre l'application.** Aucune mise à jour ne peut
> plus être publiée : il faut republier sous un autre nom de paquet, et les
> joueurs déjà installés ne reçoivent plus rien. Sauvegardez le fichier et ses
> deux mots de passe ailleurs que sur ce PC — un gestionnaire de mots de passe,
> ou un disque externe. Le dépôt exclut `*.keystore` et `*.jks` : la clé ne doit
> jamais y entrer.

Variante de build : **release**. *Create*.

Quand c'est fini, Android Studio affiche une notification en bas à droite avec
un lien **locate** : il mène au fichier `.aab`. C'est ce fichier que Play
attend.

### A.5 [Vous] Envoyer en test interne — 10 min

Console Play → votre application → **Tests** → **Test interne** → *Créer une
version*.

1. importez le `.aab` ;
2. nom de la version : `1.0.0 (2)` ;
3. notes de version :

```
Correction de la connexion à l'API : l'application joint désormais unoleague.be.
```

4. *Enregistrer* → *Vérifier la version* → *Démarrer le déploiement en test
   interne*.

Dans l'onglet **Testeurs**, créez une liste avec au minimum votre propre
adresse Gmail, et copiez le **lien d'inscription** qui apparaît dessous.

### A.6 [Vous] Installer sur votre téléphone et se connecter — 10 min

Ouvrez le lien d'inscription sur le téléphone, acceptez, puis installez depuis
Play. Comptez quelques minutes avant que la version soit proposée.

**Le test qui compte : se connecter avec votre compte.**

- La connexion passe → l'application joint l'API, la phase A est finie.
- L'écran reste vide, ou « impossible de joindre le serveur » → une des trois
  causes, dans cet ordre de probabilité : `VITE_API_URL` absent du build (A.3,
  la vérification `Select-String`), `CORS_ORIGINS` sans `https://localhost`
  (A.2), ou le paquet envoyé n'est pas celui que vous venez de construire.

Si vous voulez voir l'erreur exacte plutôt que la deviner : branchez le
téléphone en USB, activez le débogage USB dans les options de développement,
et ouvrez `chrome://inspect` sur le PC. La console de la WebView s'y affiche
comme celle d'un onglet ordinaire.

Pendant que vous y êtes : **acceptez les notifications** quand l'application le
demande, et vérifiez qu'une notification de test arrive. C'est le premier
appareil réel sur lequel le push natif tourne.

---

## Phase B — Compléter la fiche Play (2 heures)

Tous les textes sont dans `FICHE-PLAY.md` : description courte, description
complète, questionnaire de sécurité des données, classification, notes pour
l'évaluateur. Il n'y a rien à rédiger, seulement à recopier. Quatre choses
manquent encore.

### B.1 [Vous] Créer le compte de démonstration — 15 min

Google et Apple refusent une application dont le contenu est derrière une
connexion sans leur donner de quoi entrer.

Inscrivez-vous dans l'application comme un joueur ordinaire, avec une adresse
que vous contrôlez (une redirection de plus sur le domaine fait l'affaire), un
nom neutre — « Compte Démo » —, et un mot de passe long.

Ensuite, dites-le moi : je créditerai ce compte en UNO et je l'inscrirai à une
séance sur le jeu de démonstration, pour que l'évaluateur voie une application
vivante et non trois écrans vides. C'est la première cause de refus sur une
application de club.

Déclarez-le dans Play : **Règles** → **Contenu de l'application** → **Accès à
l'application** → *Tout ou partie des fonctionnalités sont limitées* → une
instruction, l'identifiant et le mot de passe.

Ces identifiants n'entrent **jamais** dans le dépôt.

### B.2 [Vous] Les captures d'écran — 30 min

Maintenant que l'application est installée (A.6), prenez-les depuis
l'application elle-même, pas depuis le site : les proportions sont justes et la
barre d'état est celle d'un vrai téléphone.

Quatre suffisent, deux sont le minimum :

1. l'accueil, avec la prochaine séance ;
2. le calendrier, avec une proposition ouverte ;
3. une carte de joueur ;
4. le classement d'une division.

Évitez les noms de joueurs réels tant que vous n'avez pas leur accord — le jeu
de démonstration est fait pour ça.

L'icône et le bandeau sont déjà prêts :

```
apps\web\assets\store\icone-512.png
apps\web\assets\store\bandeau-1024x500.png
```

### B.3 [Vous] Les deux adresses publiques — 5 min

Play → **Règles** → **Contenu de l'application** → **Politique de
confidentialité** :

```
https://unoleague.be/confidentialite.html
```

Et, dans le questionnaire **Sécurité des données**, à l'endroit où l'on
déclare que l'application permet de créer un compte, le champ *URL de
suppression de compte* :

```
https://unoleague.be/suppression-compte.html
```

Ce second champ est obligatoire et bloque l'enregistrement du formulaire tant
qu'il est vide. Les deux pages sont versionnées dans `apps/web/public/` et
suivent chaque déploiement.

Elle remplace l'adresse `…onrender.com` déclarée au départ. À faire tant que
l'application est en test : une fois en production, chaque modification de fiche
passe par une revue.

### B.4 [Vous] Les deux questionnaires — 45 min

- **Sécurité des données** : le tableau complet, catégorie par catégorie, est
  dans `FICHE-PLAY.md`. Les quatre pièges y sont aussi : ne déclarez **pas** les
  informations de paiement (elles sont saisies chez Stripe), **pas** de données
  biométriques (l'analyse du visage est locale), **pas** la position, **pas**
  les contacts.
- **Classification du contenu** : questionnaire IARC. « Non » à tout, sauf
  « les utilisateurs peuvent-ils communiquer entre eux ? » → **Oui** (les
  discussions de club). L'omettre est un motif de retrait.

---

## Phase C — Du test interne à la production (2 à 5 semaines, selon 0.2)

### C.1 [Vous] Faire tourner l'application avec de vrais joueurs — 2 semaines

Le test interne accepte cent testeurs et se met à jour en minutes. C'est là que
les premières séances réelles doivent se jouer, pas en production.

Ce qu'il faut voir fonctionner au moins une fois avant d'ouvrir au public :

- une proposition qui atteint son quota et bascule en réservation ;
- un paiement de place, et le délai de 24 heures qui libère une place non
  réglée ;
- une séance clôturée avec ses statistiques, et le classement qui bouge ;
- une commande boutique ;
- une réinitialisation de mot de passe par un joueur qui n'est pas vous ;
- une notification reçue sur un téléphone qui n'est pas le vôtre.

`DEPLOIEMENT.md` §10 détaille le déroulé. Chaque anomalie remonte ici : je
corrige, et les correctifs **web** partent tout seuls par Capgo, sans nouveau
paquet ni nouvelle revue.

### C.2 [Vous] Le test fermé, si votre compte est « Personnel » — 14 jours

Créez le canal **Test fermé**, inscrivez-y les douze testeurs préparés en 0.2,
et vérifiez au bout de quelques jours qu'ils sont bien comptés comme *opted-in*
— un testeur invité qui n'a jamais installé ne compte pas. Le compteur de 14
jours consécutifs repart de zéro si l'on descend sous douze.

Si votre compte est « Organisation », sautez cette étape.

### C.3 [Vous] La production

Play → **Production** → *Créer une version* → promouvoir la version du test.
Puis **Envoyer pour examen**. Google répond en quelques heures à quelques jours
pour une première publication.

> La production ne se retire pas : une version publiée se remplace, elle ne
> s'annule pas. C'est la seule étape irréversible du parcours.

Quand l'application est publique, notez son adresse — `https://play.google.com/store/apps/details?id=app.unoleague.mobile` —, elle
servira en phase E.

---

## Phase D — App Store (elle commence dès que 0.4 est validé)

### D.0 [Vous] Régler la question du Mac — une décision, pas une étape

Construire et signer un binaire iOS exige macOS. Il n'y a pas d'exception.
Trois routes, par ordre de simplicité pour une première publication :

| Route | Coût | Pour qui |
|---|---|---|
| **Mac loué à l'heure** (MacinCloud, Scaleway…) | quelques euros la session | **Recommandé.** Xcode gère la signature tout seul, et une session de trois heures suffit au premier envoi |
| **Machine de construction dans le nuage** (Codemagic, offre gratuite) | 0 € jusqu'à 500 min/mois | si vous comptez livrer souvent : une soirée de configuration, puis tout se fait depuis GitHub |
| **Mac mini d'occasion** | ~500 à 700 € | si l'application devient une activité à part entière |

La route du Mac loué n'est pas un pis-aller : les mises à jour **web** passent
par Capgo sans republication, et un nouveau binaire iOS n'est nécessaire que
pour un changement natif — permission, icône, plugin. En pratique, quelques
fois par an.

Dites-moi laquelle vous prenez : la préparation du dépôt (D.1) n'est pas la
même.

### D.1 [Moi] Préparer le projet iOS — fait

`apps/web/ios` n'existe pas encore : il se génère sur un Mac, et lui seul. Ce
qui est posé d'avance pour que l'heure louée ne serve pas à chercher :

- **`scripts/ios/prepare.mjs`** écrit les permissions caméra et photothèque
  dans `Info.plist`. Sans elles, iOS refuse la caméra **sans afficher la
  moindre boîte de dialogue** : l'écran annonce « l'accès a été refusé » à
  quelqu'un qui n'a rien refusé, et Apple rejette le binaire pour la même
  raison. Le script est idempotent et enchaîné à la synchronisation — il n'y a
  rien à penser à relancer ;
- **`pnpm cap:ios`** fait désormais la suite complète : build, synchronisation,
  permissions, ouverture de Xcode ;
- **le `.gitignore`** accueille déjà le projet : ses sources seront versionnées
  comme celles d'Android, et seuls Pods, `DerivedData` et le contenu web
  recopié restent ignorés.

### D.2 [Vous] Créer la fiche dans App Store Connect — 45 min

```
https://appstoreconnect.apple.com
```

**Mes apps** → **+** → *Nouvelle app*.

- Plateforme : iOS
- Nom : `UNO League`
- Langue principale : Français
- Identifiant de lot : `app.unoleague.mobile` (le même qu'Android, à créer dans
  *Certificates, Identifiers & Profiles* s'il n'est pas proposé)
- SKU : `unoleague-ios-1`

Les textes de `FICHE-PLAY.md` se reprennent tels quels : Apple demande une
description, un sous-titre, des mots-clés, l'adresse de la politique de
confidentialité, et une fiche de confidentialité qui reprend le même tableau que
Google.

### D.3 [Vous, sur le Mac] Construire et envoyer — 2 à 3 heures

**1. Installer ce qu'il faut** (une fois, sur le Mac loué) :

```bash
xcode-select --install
sudo gem install cocoapods
```

Xcode lui-même s'installe depuis le Mac App Store, et pèse une dizaine de
gigaoctets : lancez le téléchargement **en premier**, il est le plus long.

**2. Récupérer le dépôt et générer le projet iOS** — une seule fois :

```bash
git clone https://github.com/Arab-Ninja/uno-league-app.git
cd uno-league-app
pnpm install
cd apps/web
pnpm exec cap add ios
```

**3. Construire, à chaque livraison :**

```bash
export VITE_API_URL=https://unoleague.be
pnpm cap:ios
```

Cette commande enchaîne le build web, la synchronisation, les permissions de
`Info.plist` et l'ouverture de Xcode. Vérifiez au passage qu'elle affiche bien
« NSCameraUsageDescription ajouté » la première fois.

**4. Dans Xcode :**

- *Signing & Capabilities* → votre équipe, signature automatique ;
- ajoutez la capacité **Push Notifications** (bouton *+ Capability*) — sans
  elle, le jeton Firebase n'est jamais délivré sur iPhone ;
- sous *General*, alignez **Build** sur le `versionCode` d'Android et
  **Version** sur `1.0.0` ;
- **Product → Archive**, puis **Distribute App → App Store Connect**.

**5. Reverser le projet généré au dépôt**, avant de rendre le Mac :

```bash
cd ../..
git add apps/web/ios
git commit -m "Projet natif iOS"
git push
```

Ce point compte : sans lui, la prochaine session de Mac recommencerait à zéro,
et les réglages posés dans Xcode — capacité push, numéros de version — seraient
à refaire de mémoire.

### D.4 [Vous] TestFlight, puis la revue — 1 à 3 jours

Le binaire envoyé apparaît dans TestFlight après quelques minutes de
traitement. Installez-le sur un iPhone réel et refaites le test de A.6 : se
connecter. C'est la même panne possible, avec l'origine `capacitor://localhost`
cette fois — déjà présente dans `CORS_ORIGINS` depuis A.2.

Puis **Envoyer pour examen**, avec les notes de revue de `FICHE-PLAY.md`. Deux
points y sont décisifs et doivent figurer noir sur blanc :

- **les points UNO ne sont pas un bien numérique.** Ils réservent un créneau
  dans une salle réelle : un service du monde réel, explicitement exclu de
  l'achat intégré obligatoire (App Store Review Guidelines 3.1.3(e)). Sans
  cette explication, la revue demande l'achat intégré, et Apple prend 30 % ;
- **la caméra sert à la carte de joueur**, et l'analyse du visage s'exécute
  entièrement sur l'appareil.

Le compte de démonstration de B.1 est obligatoire ici aussi.

### D.5 [Vous] Publier

Publication automatique dès l'approbation, ou manuelle : choisissez manuelle,
et publiez le jour où vous êtes disponible pour regarder ce qui remonte.

---

## Phase E — Le dossier de présentation

### E.1 [Moi] Mettre les deux stores dans le dossier

Les liens des deux fiches et un code QR sur la couverture, en remplacement de
la mention du site seul. Un dossier qui montre deux applications publiées ne
demande plus qu'on le croie sur parole.

### E.2 [Vous] L'envoyer

Il est prêt depuis le début ; c'est le calendrier des stores qui commande, pas
lui.

---

## Le calendrier réaliste

| Quand | Ce qui avance |
|---|---|
| Fait | phases 0, A et B : démarches lancées, paquet fonctionnel, fiche complète |
| Maintenant | dernier paquet (suppression de compte, correctifs du push), puis production Play |
| À l'arrivée du compte Apple | phase D : projet iOS, session de Mac loué, TestFlight |
| Ensuite | revue Apple, puis phase E |

Le chemin critique n'est plus le code : c'est l'adhésion Apple. Le compte Play
étant une **Organisation**, le test fermé de quatorze jours ne s'applique pas —
la production peut être demandée dès que le paquet en test interne convient.

---

## Ce qui reste de mon côté, sans vous bloquer

- la préparation du projet iOS (D.1), dès que la route du Mac est choisie ;
- le compte de démonstration crédité et inscrit à une séance (B.1) ;
- l'arbitre sur les tournois — repoussé d'un commun accord : les tournois ne
  créent pas de proposition, il n'y a donc rien à quoi rattacher un arbitre
  aujourd'hui ;
- le changement de siège vers Londerzeel dans la politique de confidentialité,
  le jour où il est acté à la BCE.

---

## Après ce lot : la migration, puis le drapeau

Deux gestes, dans cet ordre. Le second ne sert à rien sans le premier.

### 1. [Vous] Appliquer les migrations — 5 min

Les migrations ne partent **pas** toutes seules au déploiement : Render
redéploie le code, rien d'autre. Elles s'appliquent depuis votre machine.

```powershell
cd C:\Users\yassi\Documents\uno-league-app
git checkout main
git pull
pnpm install
pnpm db:migrate
pnpm db:check
```

`db:check` doit finir sans rien signaler. Cinq migrations sont concernées :
la composition du terrain d'un club, le mode Grand Foot, le cinq d'un club
pour un tournoi, la place de chacun sur le terrain de Grand Foot, et la place
de chacun dans son équipe de session.

### 2. [Vous] Ouvrir le Grand Foot sur Render — 2 min

Render → le service **API** → *Environment* → *Add Environment Variable* :

```
FEATURE_BIGFOOT
true
```

Render redéploie tout seul ; attendez le point vert. Le mode apparaît alors
dans le calendrier, dans « Modes de jeu » et dans la console — sans nouveau
paquet Android : le drapeau est lu par le serveur, pas par l'application.

Pour le refermer, repassez la variable à `false` ; les séances déjà créées
restent en base, elles cessent simplement d'être proposées.

### 3. [Vous] Les compositions, pour vérifier

**Le cinq type d'un club.** Club → Effectif → **Modifier la compo**. Touchez
un emplacement, puis le joueur qui doit l'occuper ; deux emplacements l'un
après l'autre échangent leurs joueurs. Enregistrez, puis ouvrez un défi
accepté : le bouton **Aligner le cinq type** remplit la feuille d'un geste.

Rien n'est débité à ce moment-là — inscrire n'est pas payer, et chaque place
se règle ensuite comme avant.

**Le cinq d'un tournoi.** Tournois → un tournoi où votre club est engagé →
**Qui joue**. Même geste que sur le terrain du club, et un bouton
**Reprendre le cinq type du club** si vous l'avez déjà composé. Les feuilles
des autres clubs s'affichent en dessous : savoir qui l'on affronte fait partie
du tournoi.

**Le terrain du Grand Foot.** Ouvrez une séance Grand Foot, rejoignez une
équipe, puis touchez une place libre sur le terrain. La formation suit
l'effectif choisi à la création — 1-3-2-1 à sept, 4-4-2 à onze. Touchez votre
propre place pour la libérer, une autre pour vous déplacer. Changer d'équipe
libère la place : elle appartient à un camp.

**Le terrain d'un amical.** Même chose, en cinq contre cinq : on choisit son
camp en s'inscrivant, puis sa place parmi les cinq du futsal. La feuille de
match reprend les camps choisis, sans les redistribuer.

**Le terrain d'une UNO League.** Dès que le quinzième s'inscrit, les trois
équipes sont tirées au sort — on ne choisit pas ses coéquipiers, c'est ce qui
donne sa valeur au classement. Chacun choisit ensuite son poste dans son
équipe, pendant les vingt-quatre heures du paiement.

Les remplaçants apparaissent **sur le banc** : inscrits, sans équipe. Régler
sa place, c'est entrer sur le terrain — à la place du dernier inscrit qui n'a
pas payé, lequel passe sur le banc à son tour. C'est la règle des 24 heures,
enfin visible.
