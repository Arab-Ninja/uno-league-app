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

1. Créez un cluster sur <https://tidbcloud.com> (Serverless, région Europe).
2. Créez une base `uno_league`.
3. Récupérez la chaîne de connexion, au format
   `mysql://<user>:<mot-de-passe>@<hôte>:4000/uno_league`.
4. Renseignez `DATABASE_URL` et `DATABASE_SSL=true` — TiDB Cloud impose TLS.

### MySQL 8 auto-hébergé

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
| `DATABASE_URL` | connexion MySQL/TiDB |
| `SESSION_SECRET` | signature des jetons de session — `openssl rand -base64 48` |
| `CORS_ORIGINS` | origines autorisées, séparées par des virgules |

En production, le serveur **refuse de démarrer** si `COOKIE_SECURE` n'est pas
`true` ou si `ENABLE_DEV_TOOLS` est `true` : ces deux garde-fous évitent de
déployer par accident une configuration de développement.

Pour l'application mobile, ajoutez les origines Capacitor :

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

Pour activer Stripe (carte et Bancontact) :

1. `PAYMENT_PROVIDER=stripe` ;
2. `STRIPE_SECRET_KEY` — clé secrète du tableau de bord Stripe ;
3. déclarez le webhook `https://api.votre-domaine.app/webhooks/payments` sur
   les évènements `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` et `checkout.session.expired` ;
4. `STRIPE_WEBHOOK_SECRET` — secret de signature de ce webhook.

Un paiement n'est jamais validé par le retour de l'utilisateur depuis la page
Stripe : seul le webhook signé fait passer le paiement à l'état `paid`.
Commencez en mode test, avec les cartes de test Stripe.

---

## 6. Stockage des images

- `STORAGE_DRIVER=local` : les fichiers sont écrits dans `STORAGE_LOCAL_DIR`
  et servis par l'API. Prévoyez un volume persistant, sinon les images sont
  perdues à chaque redéploiement.
- `STORAGE_DRIVER=s3` : renseignez `S3_BUCKET`, `S3_REGION`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` et, pour Cloudflare R2,
  `S3_ENDPOINT`. `STORAGE_PUBLIC_URL` doit pointer vers le domaine public du
  bucket.

---

## 7. Sauvegardes

Le registre financier (`transactions`) est en écriture seule : c'est la
source de vérité des soldes. Sauvegardez-le en priorité.

```bash
mysqldump --single-transaction --routines uno_league > sauvegarde.sql
```

TiDB Cloud gère des sauvegardes automatiques ; vérifiez leur rétention et
testez une restauration au moins une fois par trimestre.
