# brain-dock

**AI Knowledge Platform & MCP server** — a local-first "second brain" for code projects. It builds
a structured understanding of a repository (AST symbols, architecture, dependency graph, docs,
decisions) and serves it to AI clients over MCP and a REST API.

- **MCP server** — compatible with Claude Code, Cursor, VS Code (tools / resources / prompts).
- **REST API** — versioned `/api/v1`, OpenAPI 3.1 + Swagger UI.
- **Hybrid search** — vector (Qdrant) + keyword + AST roles + intent-aware re-ranking.
- **Knowledge & memory** — long-term project memory, knowledge base, documents (md/pdf/docx…).
- **Multi-repo** — index and search across several repositories per project.
- **Local-first** — embeddings via Ollama; nothing leaves the machine.

> Full source of truth: **[Claude.md](Claude.md)**. Roadmap: [docs/roadmap](docs/roadmap/ROADMAP.md).
> Plans: [docs/plans](docs/plans/README.md). Architecture/RAG/MCP: [docs/](docs/README.md).

## Stack
Bun · NestJS · Prisma 7 + PostgreSQL · Qdrant · Redis + BullMQ · Ollama · Turborepo · Biome ·
`bun:test`. See [ADR-0001](docs/adr/0001-stack-selection.md).

```
apps/      api (REST) · mcp (MCP server) · workers (BullMQ + watch)
packages/  indexer · embedding · storage · search · knowledge · graph · core · shared · db
```

## Quickstart (development)
Requires [Bun](https://bun.sh) ≥ 1.3 and Docker.

```bash
cp .env.example .env            # adjust secrets for non-dev use
bun install
bun run infra:up                # Postgres, Qdrant, Redis, Ollama (docker compose)
bun run db:migrate              # apply Prisma migrations
docker exec brain-dock-ollama ollama pull nomic-embed-text   # only if EMBEDDER=ollama

bun run --cwd apps/api dev      # API on http://localhost:3000  (/api/v1/docs = Swagger UI)
bun --no-addons run apps/workers/src/index.ts                # index worker (BullMQ)
```

`EMBEDDER=deterministic` (default) runs fully offline — no Ollama needed; `EMBEDDER=ollama` uses
real embeddings. The setting **must match across api/mcp/workers** (they share Qdrant collections).

### Connecting an MCP client (hosted model)
brain-dock is a **hosted service**: the server (API + Qdrant + models + MCP) runs on a remote box
in containers. An end user only gets an **API key** and points their MCP client at our **remote MCP
endpoint** — nothing runs on their machine, only calls to our API (à la vexp.dev). Indexing happens
server-side via the workers; the MCP serves each user's own projects, scoped by the key.

```json
{
  "mcpServers": {
    "brain-dock": {
      "url": "https://<your-host>/mcp",
      "headers": { "Authorization": "Bearer bd_<your-api-key>" }
    }
  }
}
```
The remote MCP runs over **Streamable HTTP** (`apps/mcp/src/http.ts`; in compose: the `mcp` service
on `:8080`). The key authenticates the user (one key, many projects); `X-Project` selects the
project. It serves the persisted tools (search / context / memory / knowledge / documents);
structural/graph tools remain in the local stdio mode for now (they need a server-side symbol
index). Local stdio mode for development/self-host: `bun run --cwd apps/mcp dev` with
`PROJECT_ROOT`/`REPOS`. Details — [docs/mcp](docs/mcp/README.md).

## Test & verify
```bash
bun run ci          # db:generate → Biome → typecheck → bun test (unit, no services)
# integration tests against the running infra (Postgres + Qdrant):
set -a; source .env; set +a
RUN_E2E=1 bun test apps/api/src/e2e
bash scripts/smoke-rest.sh      # REST smoke: register → project → memory → search
curl -s localhost:3000/health/ready   # readiness: db / qdrant / redis probes
```
CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the unit suite plus an `e2e` job
with real service containers.

## Deploy
Build on the server (no image registry): `bun run deploy`
(`docker compose --profile app up -d --build`) + one-off `db:deploy`.
See [docs/deployment](docs/deployment/README.md).

## Observability
- **Metrics:** Prometheus at `GET /metrics`.
- **Tracing (opt-in):** OpenTelemetry, `OTEL_TRACES_EXPORTER=none|console|otlp` (api + workers).
</content>
