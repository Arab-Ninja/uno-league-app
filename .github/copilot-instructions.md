# UNO League — Instructions pour GitHub Copilot

## À propos du projet
Application mobile **UNO League** — une ligue de jeu UNO compétitive avec classements, wallet de points virtuels, calendrier de matchs et boutique en ligne.

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Frontend | React Native (Expo SDK 54), NativeWind v4 (Tailwind CSS), expo-router |
| Backend | Node.js, Express, tRPC v11, Zod |
| Base de données | TiDB Cloud (MySQL), Drizzle ORM (`drizzle-orm/mysql2`) |
| Auth | OAuth via Manus (openId), JWT (jose), expo-secure-store |
| Fetch / State | @tanstack/react-query, tRPC React hooks |
| Tests | Vitest |
| Package manager | pnpm |

## Structure des dossiers

```
app/              # Écrans Expo Router (file-based routing)
  (tabs)/         # Navigation par onglets (home, ranking, wallet, shop, calendar)
  oauth/          # Callback OAuth
  dev/            # Outils de développement (theme-lab, etc.)
components/       # Composants réutilisables (fut-card, country-picker, etc.)
constants/        # Constantes (thème, OAuth, config)
lib/              # Logique partagée (auth-context, trpc, player-sync, etc.)
server/           # Backend tRPC
  _core/          # Infrastructure (index.ts, trpc.ts, auth, env, llm, etc.)
  routers.ts      # Combinaison de tous les routeurs tRPC
  playersRouter.ts
  proposalsRouter.ts
  adminRouter.ts
drizzle/          # Schéma BDD et migrations (MySQL)
```

## Conventions de code

- **TypeScript strict** — tout le code est typé ; utilise `zod` pour la validation des entrées
- **NativeWind** — classes Tailwind directement dans le JSX via `className`
- **tRPC** — toutes les mutations et queries passent par tRPC (`lib/trpc.ts`)
- **AsyncStorage** — cache local ; la BDD est synchronisée en arrière-plan via `PlayerSyncProvider`
- **Drizzle ORM** — toutes les requêtes BDD sont `async`/`await` ; utilise `.$returningId()` pour les IDs après insertion ; schéma dans `drizzle/schema.ts`
- **`auth-context.tsx`** est en dehors des providers tRPC (accès direct à l'API pour l'auth)
- Nommage des fichiers : **kebab-case** (ex : `player-sync-provider.tsx`)

## Variables d'environnement requises (`.env`)

```env
DATABASE_URL=mysql://...    # TiDB Cloud connection string
```

## Commandes utiles

```bash
pnpm dev              # Démarre serveur + Metro en parallèle
pnpm dev:server       # Serveur backend uniquement
pnpm dev:metro        # Metro/Expo uniquement → QR code pour Expo Go
pnpm test             # Tests Vitest
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm db:push          # Génère et applique les migrations Drizzle
```

## Tester l'application depuis VS Code

1. Ouvrir le terminal intégré (`Ctrl+ù` ou `` Ctrl+` ``)
2. `git pull` — récupérer la dernière version
3. `pnpm install` — installer les dépendances si `package.json` a changé
4. `pnpm dev:metro` — lancer Metro → scanner le QR code avec **Expo Go**
5. Ou utiliser **F5** → sélectionner la configuration **"🚀 UNO League — App complète"**

## Utiliser Copilot en mode Agent dans VS Code

1. Ouvrir le **chat Copilot** : `Ctrl+Alt+I` (Windows/Linux) ou `Cmd+Alt+I` (Mac)
2. Dans le menu déroulant en haut du panneau chat, sélectionner **"Agent"** (au lieu de "Ask" ou "Edit")
3. En mode Agent, Copilot peut lire les fichiers, exécuter des commandes terminal et modifier du code de façon autonome
4. Exemples de prompts utiles en mode agent :
   - `@workspace Explique la structure de l'authentification`
   - `@workspace Ajoute un nouveau routeur tRPC pour les tournois`
   - `@workspace Corrige les erreurs TypeScript dans wallet.tsx`

> 💡 Si le message "abonnement expiré" persiste après renouvellement : ouvrir VS Code → `Ctrl+Shift+P` → **"GitHub Copilot: Sign Out"** → **"GitHub Copilot: Sign In"** pour rafraîchir les credentials.
