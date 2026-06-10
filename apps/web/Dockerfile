# brain-dock web — static SPA built with Vite, served by a tiny Bun server (serve.ts).
# TLS/compression/routing live in the host nginx (deploy/nginx/brain-dock.ru.conf).
FROM oven/bun:1.3.5 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --omit=optional || bun install

COPY apps/web apps/web
RUN cd apps/web && bunx vite build

FROM oven/bun:1.3.5
WORKDIR /app
COPY --from=build /app/apps/web/dist apps/web/dist
COPY apps/web/serve.ts apps/web/serve.ts
ENV WEB_PORT=3300
EXPOSE 3300
USER bun
CMD ["bun", "run", "apps/web/serve.ts"]
