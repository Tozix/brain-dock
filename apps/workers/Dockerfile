# brain-dock workers — build from repo root: `docker build -f apps/workers/Dockerfile -t brain-dock-workers .`
FROM oven/bun:1.3.5 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile --omit=optional
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x bun run db:generate

ENV NODE_ENV=production
# Match the api image: own the shared staging volume mount point as `bun` (see apps/api/Dockerfile).
RUN mkdir -p /var/lib/brain-dock/staging && chown -R bun:bun /var/lib/brain-dock
# Drop root: the runtime only reads /app (oven/bun ships a non-root `bun` user).
USER bun
# --no-addons makes the native msgpackr-extract require throw (caught) instead of panic on Bun.
CMD ["bun", "--no-addons", "run", "apps/workers/src/index.ts"]
