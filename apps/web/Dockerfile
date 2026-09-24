# ---- بناء الواجهات ----
FROM node:25-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY tsconfig.base.json ./
ENV VITE_TENANT_FROM_SUBDOMAIN=true
RUN pnpm --filter @dm/shared build && pnpm --filter @dm/web build

# ---- Caddy: بيقدّم الواجهات، وبيعمل شهادة HTTPS تلقائي، وبيوصّل /api للسيرفر ----
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
