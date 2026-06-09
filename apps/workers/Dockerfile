# brain-dock workers — build from repo root: `docker build -f apps/workers/Dockerfile -t brain-dock-workers .`
FROM oven/bun:1.3.5 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps

RUN bun install --omit=optional
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x bun run db:generate

ENV NODE_ENV=production
# --no-addons makes the native msgpackr-extract require throw (caught) instead of panic on Bun.
CMD ["bun", "--no-addons", "run", "apps/workers/src/index.ts"]
