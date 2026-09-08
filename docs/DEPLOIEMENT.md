# Déploiement

L'application se compose de deux artefacts indépendants :

| Artefact | Nature | Où le déployer |
|---|---|---|
| `apps/web/dist` | site statique | Vercel, Netlify, Cloudflare Pages, ou tout hébergeur de fichiers |
| `apps/api` | serveur Node conteneurisé | Railway, Render, Fly.io, ou un VPS avec Docker |

Les deux communiquent par HTTPS. La base MySQL/TiDB est la seule dépendance
externe obligatoire.

---

## 1. Base de données

### TiDB Cloud (recommandé — offre gratuite)

Depuis le panneau **Connect** de votre cluster :

**1. Générez un mot de passe.** Bouton *Generate Password*. Il ne s'affiche
qu'une seule fois — copiez-le immédiatement. Le panneau vous donne alors :

| Champ | Exemple |
|---|---|
| HOST | `gateway01.eu-central-1.prod.aws.tidbcloud.com` |
| PORT | `4000` |
| USERNAME | `xxxxxxxxxxxxxxx.root` |
| DATABASE | `sys` ← à remplacer, voir l'étape 2 |

**2. Créez la base.** Le panneau propose `sys`, qui est une base système : ce
n'est pas là que l'application doit écrire. Ouvrez l'onglet **SQL Editor** de
la console TiDB et exécutez :

```sql
CREATE DATABASE uno_league CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**3. Configurez la connexion.** Le fichier de configuration s'appelle `.env`
et se place **à la racine du dépôt**, à côté de `package.json` :

```
uno-league-app/
├── .env            ← ici, ce fichier
├── .env.example
├── package.json
├── apps/
└── packages/
```

Il n'existe pas au départ : `.env.example` sert de modèle. Créez-le avec
`cp .env.example .env` (macOS, Linux) ou `copy .env.example .env` (Windows),
puis ouvrez-le dans un éditeur de texte. Ce fichier contient vos mots de
passe : il est déjà exclu du dépôt par `.gitignore` et ne doit jamais être
commité.

Deux formes équivalentes pour la connexion ; la seconde est préférable ici.

```bash
# Forme composants — recommandée avec TiDB Cloud
DATABASE_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
DATABASE_PORT=4000
DATABASE_USER=xxxxxxxxxxxxxxx.root
DATABASE_PASSWORD=le-mot-de-passe-généré
DATABASE_NAME=uno_league
DATABASE_SSL=true
```

Les mots de passe générés par TiDB contiennent fréquemment `@`, `/`, `:`, `?`,
`#` ou `%`. Dans une URL écrite à la main, ces caractères coupent la chaîne au
mauvais endroit et produisent une erreur trompeuse — souvent « hôte
introuvable » ou « accès refusé », alors que les identifiants sont bons. La
forme composants encode ces caractères pour vous.

Si le mot de passe contient un `#`, encadrez-le de guillemets droits :
`DATABASE_PASSWORD="votre#mot#de#passe"`. Sans guillemets, tout ce qui suit le
`#` est traité comme un commentaire et le mot de passe est tronqué
silencieusement — le serveur répond « accès refusé » sans autre indice.
`pnpm db:check` détecte ce cas et le signale.

Si vous préférez malgré tout une URL complète, encodez le mot de passe :
`@` → `%40`, `/` → `%2F`, `:` → `%3A`, `?` → `%3F`, `#` → `%23`, `%` → `%25`.

```bash
DATABASE_URL=mysql://xxxxxxxxxxxxxxx.root:mot%40de%2Fpasse@gateway01...:4000/uno_league
DATABASE_SSL=true
```

**4. Vérifiez.**

```bash
pnpm db:check
```

Cette commande teste la connexion, le chiffrement, la base sélectionnée, le
schéma, les contraintes et la cohérence du registre financier. En cas
d'échec, elle indique quoi corriger. Lancez-la avant `db:migrate`, puis à
nouveau après.

**5. Autorisez l'adresse IP du serveur.** La console n'autorise par défaut que
l'adresse depuis laquelle vous naviguez. Une fois l'API déployée, elle sortira
avec une autre adresse et la connexion sera refusée. Dans
*Settings → Networking*, ajoutez l'adresse de sortie de votre hébergeur, ou
`0.0.0.0/0` si celui-ci n'offre pas d'adresse fixe — la sécurité repose alors
entièrement sur le mot de passe et TLS, qui sont solides, mais l'exposition
est plus large.

### Après chaque `git pull`

Une mise à jour peut apporter de nouvelles migrations. Prenez l'habitude de :

```bash
git pull
pnpm install
pnpm db:migrate
pnpm db:check
```

`db:check` vérifie que le schéma correspond au code et signale une migration
en attente. Sans elle, l'application affiche « une erreur est survenue » sur
les écrans concernés, sans autre explication : le serveur, lui, journalise
alors « Le schéma de la base ne correspond pas au code ».

### Si une migration s'est arrêtée en cours de route

Les instructions `CREATE TABLE` sont validées une par une : une migration
interrompue laisse la base à moitié construite, et la relancer échouera sur
les tables déjà créées. Repartez d'une base vierge — il n'y a rien à
préserver tant qu'aucune donnée réelle n'existe :

```sql
DROP DATABASE uno_league;
CREATE DATABASE uno_league CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

puis relancez `pnpm db:migrate`. `pnpm db:check` liste les tables manquantes
et permet de repérer une base partiellement migrée.

### Deux différences de TiDB à connaître

TiDB parle le protocole MySQL sans en reproduire tout le comportement. Deux
points touchent ce schéma :

- **Contraintes CHECK** : TiDB les analyse puis les **ignore** par défaut. Les
  migrations passent, mais l'interdiction en base d'un solde négatif n'est pas
  active. Pour l'activer : `SET GLOBAL tidb_enable_check_constraint = ON;`
- **Clés étrangères** : appliquées sur les versions récentes, avec
  `foreign_key_checks` actif.
- **Valeurs par défaut sur colonnes JSON** : refusées, là où MySQL 8.0.13+ les
  accepte. Le schéma n'en utilise aucune, et un test de la suite (`pnpm test`)
  relit le SQL généré pour interdire cette construction ainsi que quelques
  autres non supportées.

Dans les deux cas, le code applicatif refuse déjà ces situations — le registre
UNO rejette tout débit excédentaire et vérifie l'existence des références.
Ces contraintes sont une seconde ligne de défense, pas la première.
`pnpm db:check` vous dit lesquelles sont réellement en place.

### MySQL 8 auto-hébergé — *alternative, à ignorer si vous utilisez TiDB*

Cette section ne concerne que ceux qui hébergent eux-mêmes la base. **Si vous
avez suivi la section TiDB Cloud ci-dessus, passez directement à « Appliquer
le schéma ».** Les deux voies sont exclusives : une seule base, pas deux.

`docker compose up -d db` suffit : le service `db` du `docker-compose.yml`
crée la base et l'utilisateur.

### Appliquer le schéma

```bash
pnpm --filter @uno/api db:migrate
```

Cette commande est idempotente : elle n'applique que les migrations en attente
et peut donc être rejouée à chaque déploiement.

---

## 2. API

### Variables d'environnement

Toutes les valeurs sont décrites dans `.env.example`. Trois sont
indispensables et n'ont volontairement aucune valeur par défaut :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | connexion MySQL/TiDB (ou les composants `DATABASE_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME`) |
| `SESSION_SECRET` | signature des jetons de session — `openssl rand -base64 48` |
| `CORS_ORIGINS` | origines autorisées, séparées par des virgules |

En production, le serveur **refuse de démarrer** si `COOKIE_SECURE` n'est pas
`true` ou si `ENABLE_DEV_TOOLS` est `true` : ces deux garde-fous évitent de
déployer par accident une configuration de développement.

**Comprendre `CORS_ORIGINS`.** Un navigateur refuse par défaut qu'une page
servie par un site appelle une API située ailleurs. Cette variable est la
liste des adresses depuis lesquelles l'API accepte d'être appelée — rien
d'autre. Ce n'est ni un nom de domaine à acheter, ni un hébergeur à choisir :
c'est simplement *où tourne votre application web*.

| Situation | Valeur à mettre |
|---|---|
| Développement sur votre machine | `http://localhost:5173,capacitor://localhost,http://localhost` |
| Application publiée sur Vercel/Netlify sans domaine à vous | l'adresse fournie par l'hébergeur, par exemple `https://uno-league.vercel.app` |
| Domaine personnel acheté plus tard | `https://votre-domaine.app` |
| Application mobile empaquetée | ajoutez `capacitor://localhost` et `http://localhost` |

Les valeurs se cumulent, séparées par des virgules et **sans barre oblique
finale**. Tant que vous développez en local, la valeur par défaut du
`.env.example` convient telle quelle : vous n'avez rien à acheter pour
commencer. Le jour où vous publiez, ajoutez l'adresse réelle — une adresse
manquante se manifeste par un appel API bloqué par le navigateur, avec un
message mentionnant CORS dans la console.

Pour l'application mobile, les origines Capacitor sont indispensables :

```
CORS_ORIGINS=https://votre-domaine.app,capacitor://localhost,http://localhost
```

### Compte administrateur initial

Renseignez `ADMIN_EMAIL` et `ADMIN_PASSWORD` avant le premier démarrage : le
compte est créé automatiquement avec le rôle `admin`. **Changez ce mot de
passe depuis l'application dès la première connexion**, puis retirez la
variable de l'environnement.

### Déploiement Docker

```bash
docker build -f apps/api/Dockerfile -t uno-league-api .
docker run -p 4000:4000 --env-file .env uno-league-api
```

Ou, avec la base incluse :

```bash
docker compose up -d
```

### Déploiement Railway / Render / Fly.io

Ces plateformes détectent le `Dockerfile`. Configurez :

- chemin du Dockerfile : `apps/api/Dockerfile`, contexte : racine du dépôt ;
- port exposé : `4000` ;
- sonde de disponibilité : `GET /health` ;
- les variables d'environnement ci-dessus.

---

## 3. Application web

```bash
VITE_API_URL=https://api.votre-domaine.app pnpm --filter @uno/web build
```

Le contenu de `apps/web/dist` est un site statique. Configurez l'hébergeur
pour renvoyer `index.html` sur toutes les routes inconnues (SPA fallback) :

- **Vercel** : `vercel.json` → `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- **Netlify** : `_redirects` → `/* /index.html 200`
- **Cloudflare Pages** : détecté automatiquement.

`VITE_API_URL` est lu à la compilation : chaque environnement a donc son
propre build. Sans cette variable, le client appelle `/trpc` sur sa propre
origine, ce qui convient si un proxy inverse place l'API derrière le même
domaine.

---

## 4. Application mobile (App Store et Google Play)

L'application web est empaquetée avec Capacitor. Le code JavaScript est
**embarqué dans le binaire**, pas chargé depuis une URL distante : Apple
refuse les applications qui ne sont qu'une coquille autour d'un site web.

```bash
cd apps/web

# Une seule fois : génère les projets natifs
pnpm exec cap add ios
pnpm exec cap add android

# À chaque livraison
VITE_API_URL=https://api.votre-domaine.app pnpm build
pnpm exec cap sync

pnpm exec cap open ios       # ouvre Xcode
pnpm exec cap open android   # ouvre Android Studio
```

Les dossiers `apps/web/ios` et `apps/web/android` sont exclus du dépôt : ils
sont régénérés par `cap add`. Si vous ajoutez des réglages natifs
(certificats, icônes, permissions), retirez-les du `.gitignore` et versionnez-les.

### Points d'attention pour la validation des stores

- **Session** : dans l'application native, le jeton est conservé par
  Capacitor Preferences (Keychain iOS / stockage privé Android) et envoyé en
  en-tête `Authorization`. Les cookies de WebView ne sont pas fiables.
- **HTTPS obligatoire** : `androidScheme: "https"` est déjà configuré.
- **Paiements** : Apple exige l'achat intégré pour les biens numériques
  consommés dans l'application. Les points UNO servent à réserver un terrain
  physique — un service du monde réel, exclu de la règle (App Store Review
  Guidelines 3.1.3(e)). Documentez ce point dans les notes de revue.
- **Compte de test** : fournissez un identifiant de démonstration à Apple,
  sans quoi la revue est refusée.

---

## 5. Paiements externes

Tant que `PAYMENT_PROVIDER=none`, l'API n'expose que le paiement en points
UNO et l'interface n'affiche aucun autre moyen : il n'y a donc pas de parcours
de paiement sans issue.

Pour activer Stripe (carte, Apple Pay, Google Pay et Bancontact) :

1. `PAYMENT_PROVIDER=stripe` ;
2. `STRIPE_SECRET_KEY` — clé secrète du tableau de bord Stripe ;
3. déclarez le webhook `https://api.votre-domaine.app/webhooks/payments` sur
   les évènements `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` et `checkout.session.expired` ;
4. `STRIPE_WEBHOOK_SECRET` — secret de signature de ce webhook ;
5. `PAYMENT_RETURN_URL` — l'adresse de votre application web, par exemple
   `https://votre-domaine.app/calendrier`.

Dans le tableau de bord Stripe, activez **Bancontact** sous *Paramètres →
Moyens de paiement*. Il n'accepte que l'euro, ce qui est déjà le cas ici.

### Apple Pay et Google Pay

Ils n'apparaissent **pas** comme des choix séparés dans l'application : ce
sont des porte-cartes, proposés à l'intérieur du tunnel « Carte » quand
l'appareil en dispose. Sur un iPhone avec une carte dans Wallet, le bouton
Apple Pay s'affiche en haut de la page Stripe ; sur Android avec Google Pay,
de même. Il n'y a rien à coder pour cela, mais **une déclaration à faire une
fois** :

1. tableau de bord Stripe → *Paramètres → Moyens de paiement → Domaines de
   paiement* (*Payment method domains*) ;
2. ajoutez le domaine de votre application web (celui de `PAYMENT_RETURN_URL`,
   pas celui de l'API) ;
3. Stripe vérifie automatiquement le domaine s'il est hébergé chez lui ;
   sinon, déposez le fichier de vérification qu'il fournit à l'adresse
   `/.well-known/apple-developer-merchantid-domain-association`.

Sans cette étape, tout fonctionne — carte, Bancontact — mais le bouton Apple
Pay reste invisible. C'est la cause la plus fréquente de « Apple Pay ne
s'affiche pas ».

Apple Pay exige aussi **HTTPS** et, à ce jour, Safari ou une application
installée : il ne s'affiche pas dans un Chrome de bureau sans appareil Apple.
Pour l'essayer, utilisez un vrai iPhone en mode test Stripe.

L'intégration **native** (feuille de paiement Apple, sans page web) demande un
identifiant marchand Apple et un certificat. Elle n'est pas nécessaire pour
publier : dans l'application empaquetée, le tunnel Stripe s'ouvre dans le
navigateur système et Apple Pay y fonctionne.

### Le webhook seul fait foi

Un paiement n'est jamais validé par le retour de l'utilisateur depuis la page
Stripe : seul le webhook signé fait passer le paiement à l'état `paid`.
L'URL de retour porte bien `?paiement=succes`, mais l'application se contente
d'attendre et de rafraîchir — un joueur qui tape cette adresse à la main ne
paie rien.

Commencez en mode test, avec les cartes de test Stripe (`4242 4242 4242 4242`,
date future, CVC quelconque). Le webhook se teste en local avec
`stripe listen --forward-to localhost:4000/webhooks/payments`.

---

## 6. Notifications push

Les notifications push utilisent le **Web Push** standard : aucun compte
Firebase, aucun certificat Apple. Deux clés suffisent, générées une seule
fois :

```bash
pnpm push:keys
```

La commande affiche `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` : recopiez-les
dans le `.env` de l'API. Renseignez aussi `VAPID_SUBJECT` avec une adresse de
contact réelle (`mailto:vous@exemple.com`) — les services de push l'exigent
pour vous joindre en cas d'abus.

**Ces clés sont l'identité de votre serveur.** Les changer invalide tous les
abonnements existants : chaque joueur devrait réactiver les notifications.
Générez-les une fois, sauvegardez-les avec vos autres secrets, et gardez les
mêmes entre les déploiements.

Sans ces variables, le push est simplement absent : le réglage n'apparaît pas
dans l'application et les notifications restent visibles dedans, comme avant.
Rien ne casse.

### Ce qu'il faut savoir côté joueurs

- **HTTPS obligatoire**, sauf sur `localhost`. En développement, le push
  fonctionne donc sans certificat.
- **Sur iPhone**, Apple n'autorise le push que pour une application **ajoutée
  à l'écran d'accueil** (Partager → Sur l'écran d'accueil), depuis iOS 16.4.
  L'application affiche elle-même cette consigne au bon moment.
- **L'abonnement appartient à l'appareil**, pas au compte : un joueur qui
  active les notifications sur son téléphone ne les a pas activées sur son
  ordinateur. L'écran de réglage indique combien d'appareils sont abonnés.
- Le fichier `apps/web/public/sw.js` doit être servi **à la racine** du site,
  sans en-tête de cache agressif. Les hébergeurs statiques le font par défaut.

L'administration reçoit les mêmes notifications que les joueurs : un compte
`admin` abonné sur son téléphone est prévenu de chaque réservation, achat et
commande.

---

## 7. Stockage des images

- `STORAGE_DRIVER=local` : les fichiers sont écrits dans `STORAGE_LOCAL_DIR`
  et servis par l'API. Prévoyez un volume persistant, sinon les images sont
  perdues à chaque redéploiement.
- `STORAGE_DRIVER=s3` : renseignez `S3_BUCKET`, `S3_REGION`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` et, pour Cloudflare R2,
  `S3_ENDPOINT`. `STORAGE_PUBLIC_URL` doit pointer vers le domaine public du
  bucket.

---

## 8. Sauvegardes

Le registre financier (`transactions`) est en écriture seule : c'est la
source de vérité des soldes. Sauvegardez-le en priorité.

```bash
mysqldump --single-transaction --routines uno_league > sauvegarde.sql
```

TiDB Cloud gère des sauvegardes automatiques ; vérifiez leur rétention et
testez une restauration au moins une fois par trimestre.

---

## 9. Mises à jour après publication

Publier sur l'App Store et Google Play ne fige rien : on continue à modifier
l'application exactement comme aujourd'hui. Ce qui change, c'est **par quel
canal** la modification atteint les joueurs.

| Ce que vous changez | Comment cela arrive chez le joueur | Délai |
|---|---|---|
| Le serveur (règles, prix, corrections d'API) | redéploiement de l'API | immédiat, pour tout le monde |
| L'application web ouverte au navigateur | nouveau build du site statique | immédiat, au rechargement |
| Écrans, textes, correctifs de l'application mobile | **mise à jour à chaud** (Capgo) | au lancement suivant |
| Plugin natif, icône, permissions, version minimale d'OS | **republication sur les stores** | 1 à 3 jours de revue |

### Mise à jour à chaud (Capgo)

Le plugin `@capgo/capacitor-updater` est déjà installé et configuré. Il
télécharge la nouvelle version du contenu web au lancement, l'applique **au
démarrage suivant** (jamais en pleine session), et **revient automatiquement à
la version précédente** si l'application ne confirme pas son bon démarrage
dans les dix secondes.

Pour l'activer :

1. créez un compte sur [capgo.app](https://capgo.app) et un projet ;
2. `pnpm exec npx @capgo/cli init` depuis `apps/web`, puis renseignez la clé
   fournie ;
3. à chaque livraison de contenu web :

```bash
cd apps/web
VITE_API_URL=https://api.votre-domaine.app pnpm build
pnpm exec npx @capgo/cli bundle upload --channel production
```

Tant qu'aucune clé n'est fournie, le plugin reste inerte : l'application
n'interroge aucun service et se comporte comme un binaire ordinaire.

**Apple et Google l'autorisent explicitement** tant que l'application ne
change pas de nature ni de fonction principale (App Store Review Guidelines
3.3.2, Google Play Device and Network Abuse). Une nouvelle fonctionnalité
majeure mérite malgré tout une republication : c'est elle qui met à jour la
fiche, les captures d'écran et le numéro de version affiché.

### Ce qui impose toujours de republier

- ajouter un plugin Capacitor (caméra, biométrie, paiement natif…) ;
- changer l'icône, le nom, l'écran de lancement ;
- demander une nouvelle permission système ;
- relever la version minimale d'iOS ou d'Android ;
- publier un numéro de version visible sur la fiche du store.

---

## 10. Essayer avec de vrais joueurs, avant les stores

Il n'est pas nécessaire d'attendre la publication pour faire tester
l'application à de vrais joueurs. Trois étapes, de la plus rapide à la plus
proche du produit final.

### Étape 1 — l'application web, sans rien installer *(quelques heures)*

C'est la voie la plus courte, et elle suffit pour valider les règles du jeu,
les réservations et les paiements avec un premier groupe.

1. déployez l'API (section 2) et le site web (section 3) ;
2. renseignez `CORS_ORIGINS` avec l'adresse du site ;
3. envoyez le lien aux joueurs.

Ils ouvrent l'application dans leur navigateur et peuvent l'**ajouter à
l'écran d'accueil** : elle s'affiche alors en plein écran, avec son icône,
comme une application installée — et les notifications push fonctionnent.
Aucun store, aucune revue, aucune attente.

**Utilisez d'abord Stripe en mode test.** Les joueurs paient avec les cartes
de test, rien n'est débité, et vous vérifiez tout le parcours. Basculez en
clés réelles quand vous êtes prêt à encaisser.

### Étape 2 — l'application mobile en test fermé *(1 à 2 jours)*

Quand vous voulez tester le vrai binaire :

- **Android** : Google Play Console → *Test interne*. Vous invitez jusqu'à
  100 testeurs par adresse e-mail, la mise à disposition est presque
  immédiate et il n'y a pas de revue complète.
- **iOS** : TestFlight. Le test interne (jusqu'à 100 personnes de votre
  équipe) est disponible sans revue ; le test externe (jusqu'à 10 000
  personnes) passe par une revue légère de un à deux jours.

Il faut pour cela les comptes développeur : 25 $ une fois pour Google, 99 $
par an pour Apple.

### Étape 3 — la publication publique

Les mêmes binaires, soumis en revue complète. Prévoyez les captures d'écran,
la politique de confidentialité, et le compte de démonstration exigé par
Apple (voir §4).

### Avant d'ouvrir à de vrais joueurs

- [ ] `COOKIE_SECURE=true` et `ENABLE_DEV_TOOLS=false` en production ;
- [ ] `ADMIN_PASSWORD` changé depuis l'application, puis retiré de
      l'environnement ;
- [ ] base de production **vide de données de démonstration** — le seed est
      réservé au développement ;
- [ ] sauvegarde automatique vérifiée (section 8) ;
- [ ] `SESSION_SECRET` aléatoire et propre à la production ;
- [ ] un essai complet de bout en bout par vous-même : inscription, paiement,
      session, saisie des résultats.
