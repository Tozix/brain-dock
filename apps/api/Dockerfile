# brain-dock API — build from repo root: `docker build -f apps/api/Dockerfile -t brain-dock-api .`
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Manifests first for a cacheable install layer.
COPY package.json bun.lock tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps

RUN bun install --omit=optional
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x bun run db:generate

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/main.ts"]
