# brain-dock MCP server — build from repo root: `docker build -f apps/mcp/Dockerfile -t brain-dock-mcp .`
FROM oven/bun:1.3.5 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile --omit=optional
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x bun run db:generate

ENV NODE_ENV=production
# Drop root: the runtime only reads /app (oven/bun ships a non-root `bun` user).
USER bun
# MCP speaks JSON-RPC over stdio.
CMD ["bun", "run", "apps/mcp/src/index.ts"]
