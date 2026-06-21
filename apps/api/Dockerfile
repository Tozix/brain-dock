# brain-dock API — build from repo root: `docker build -f apps/api/Dockerfile -t brain-dock-api .`
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Manifests first for a cacheable install layer.
COPY package.json bun.lock tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile --omit=optional
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x bun run db:generate

ENV NODE_ENV=production
EXPOSE 3100
# Pre-create the upload-staging dir owned by `bun` so the (initially root-owned) named volume
# inherits that ownership on first mount — the non-root runtime must be able to write into it.
RUN mkdir -p /var/lib/brain-dock/staging && chown -R bun:bun /var/lib/brain-dock
# Drop root: the runtime only reads /app (oven/bun ships a non-root `bun` user).
USER bun
CMD ["bun", "run", "apps/api/src/main.ts"]
