# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# API UNO League — image de production
#
# Build en deux étapes : les dépendances de développement et les sources
# TypeScript ne se retrouvent pas dans l'image finale.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

# Les manifestes d'abord : la couche d'installation reste en cache tant que
# les dépendances ne changent pas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter @uno/api... --filter @uno/shared

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter @uno/api build

# ---------------------------------------------------------------------------

FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && apk add --no-cache tini

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod --filter @uno/api && pnpm store prune

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/drizzle ./apps/api/drizzle

# L'application ne tourne pas en root.
RUN addgroup -S uno && adduser -S uno -G uno && chown -R uno:uno /app
USER uno

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini transmet correctement SIGTERM : l'arrêt reste propre.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
