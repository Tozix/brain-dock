# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ЖЁСТКОЕ ПРАВИЛО ОБЩЕНИЯ (ОБЯЗАТЕЛЬНО)

**Задавай уточняющие вопросы на русском языке с подробным объяснением каждого варианта с указанием, что рекомендуешь!**

- Любой уточняющий вопрос (через `AskUserQuestion` или текстом) — **только на русском**.
- Для **каждого** варианта давай развёрнутое объяснение: суть, плюсы/минусы, последствия выбора.
- **Явно указывай, какой вариант рекомендуешь** и почему (рекомендованный — первым, с пометкой «(рекомендую)»).
- Это правило приоритетно и распространяется на все взаимодействия в этом репозитории.

## ЖЁСТКОЕ ПРАВИЛО: Context7 + свежие стабильные версии (ОБЯЗАТЕЛЬНО)

**Как можно чаще используй Context7 (`mcp__plugin_context7_context7__*`) и ставь самые свежие СТАБИЛЬНЫЕ версии пакетов.**

- Перед использованием/добавлением **любой** библиотеки сверяйся с актуальной документацией
  через Context7 (`resolve-library-id` → `query-docs`). Не полагайся на знания по памяти —
  API меняются, особенно у NestJS, Prisma, BullMQ, Qdrant-клиента, Zod, Biome, Turborepo.
- При добавлении зависимостей выбирай **последнюю стабильную** версию (latest stable).
  **Не** использовать pre-release/beta/rc/canary без явного согласования с пользователем.
- Это дополняет, а не заменяет vexp: vexp — для контекста **нашего** кода;
  Context7 — для документации и API **внешних** библиотек.

## What this is

`brain-dock` is a **hosted, local-first AI knowledge platform & MCP server** (vexp.dev-style
product model): the server runs the API + Postgres + Qdrant + Redis + Ollama + a remote MCP
endpoint. A user gets an **API key**, points their MCP client (Claude Code, Cursor, …) at the
**remote MCP endpoint over HTTP**, and nothing runs on their machine — only calls to our API.
The end-to-end deploy + MCP-connection walkthrough lives in [docs/GUIDE.md](../docs/GUIDE.md)
(in Russian); numbered implementation plans are in [docs/plans/](../docs/plans/) (`NNN-*.md`,
000→053) and commits reference them (e.g. "plan 051").

## Toolchain

- **Bun** (≥ 1.3, pinned `bun@1.3.5`) is the runtime, package manager, **and** test runner — it
  executes TypeScript directly, so there is no compile step to *run* code (`tsc` is type-check
  only, `noEmit`). `bun install` to bootstrap.
- **Turborepo** orchestrates `build` / `typecheck` / `test` across the workspaces (`apps/*`,
  `packages/*`), respecting `^build` dependency order.
- **Biome** is the single linter + formatter (not ESLint/Prettier): 2-space indent, width 100,
  single quotes, trailing commas `all`, semicolons always. `generated/`, `dist/`, `.vexp`,
  `.claude` are excluded.
- **TypeScript** is `strict` + `noUncheckedIndexedAccess`, ES2022 / bundler resolution, with
  experimental decorators enabled (for NestJS). Config in [tsconfig.base.json](../tsconfig.base.json).
- **Prisma 7** with the new `prisma-client` generator (Bun runtime, pg driver adapter, no native
  binaries). The generated client is written to `packages/db/src/generated` and is gitignored —
  **run `bun run db:generate` after a fresh checkout or schema change** (it is the first step of `ci`).

## Commands (run from repo root)

| Command | What it does |
|---|---|
| `bun install` | Install all workspace deps |
| `bun run ci` | **Full gate**: `db:generate` → `biome check` → `turbo typecheck` → `bun test`. Run this before considering work done. |
| `bun run build` | `turbo run build` (emit `dist/**`) |
| `bun run dev` | `turbo run dev` (persistent watch across apps) |
| `bun test` | Run **all** tests (Bun's runner). Tests are `*.test.ts` next to source. |
| `bun test apps/mcp/src/remote/auth.test.ts` | Run a **single** test file |
| `bun test -t "substring"` | Run tests whose name matches a substring |
| `bun run lint` / `lint:fix` / `format` | Biome check / autofix / format |
| `bun run typecheck` | `turbo run typecheck` (per-package `tsc --noEmit`) |
| `bun run db:generate` / `db:migrate` / `db:deploy` | Prisma client gen / dev migration / apply migrations |
| `bun run infra:up` / `infra:down` | Start/stop infra only (Postgres, Qdrant, Redis, Ollama) via Docker Compose |
| `bun run deploy` | `docker compose --profile app up -d --build` — full stack (infra + migrate + ollama-pull + api + workers + mcp), images built on host |
| `bun run dev:stack` | API + worker + MCP in one terminal (dev ports 3100/8080) |
| `bun run search:eval` | Search-quality eval harness (40 golden queries → nDCG@10/MRR/Recall@5; needs Qdrant up) |
| `RUN_E2E=1 bun --no-addons test apps/api/src/e2e` | e2e against live infra (`--no-addons` required: AppModule pulls BullMQ) |

### Running services locally (dev, infra in Docker + services via Bun)

```bash
bun run infra:up && bun run db:migrate
bun --no-addons run apps/api/src/main.ts        # REST API → http://localhost:3000  (Swagger: /api/v1/docs)
bun --no-addons run apps/workers/src/index.ts   # BullMQ index worker
bun run apps/mcp/src/http.ts                     # hosted MCP → http://localhost:8080/mcp
```

- **`--no-addons` is mandatory for `api` and `workers`** — BullMQ pulls a native module that is
  incompatible with Bun without this flag. The MCP HTTP server does not need it.
- **`EMBEDDER`** selects the embedding provider: `deterministic` (default, offline, fast — for dev)
  vs `ollama` (real semantic search). It **must be consistent** across every service that writes the
  same Qdrant collection, or vectors become incomparable.
- Env is validated by **Zod at boot**. With `NODE_ENV=production` the API **refuses to start** if a
  JWT secret is left at its default or is shorter than 32 chars. Template: [.env.example](../.env.example).
- Infra host ports are deliberately non-default to avoid clashes: Postgres `15432`, Qdrant
  `16333/16334`, Redis `16379`, Ollama `11434`.

## Architecture

Monorepo of **4 apps** + **9 packages**. The data flow is:
**repository (server path or uploaded files) → indexing → embeddings to Qdrant + symbol graph to
Postgres → MCP serves context to the AI client**, scoped by user (API key) and project
(`X-Project` header or `/mcp/{slug}` URL path).

### Apps (`apps/*`)

- **`api`** — NestJS 11 REST API (`:3000`, Swagger at `/api/v1/docs`). Owns auth (JWT access/refresh
  + API keys), users/projects/repositories, CRUD for memory/knowledge/documents, upload-and-index
  (`indexing`) and usage rollups (`usage`); triggers indexing by enqueuing BullMQ jobs. Modules under
  `src/`: `auth`, `api-keys`, `projects`, `repositories`, `indexing`, `usage`, `knowledge`, `audit`
  (write + admin read endpoint), `health` (readiness probes Postgres/Qdrant/Redis), `metrics`
  (Prometheus `/metrics`, optional `METRICS_TOKEN`), `config` (Zod env), `tracing` (OpenTelemetry),
  `prisma`, `openapi`, `common` (global exception filter `{code,message,details?}`, pagination), `e2e`.
  Errors follow one envelope; list endpoints take `take`/`skip`. Server-path reindex is gated by
  `INDEX_SERVER_PATHS` (off in production — hosted users index via upload).
- **`workers`** — BullMQ background indexer. Reads code at `repository.root`, parses it with **ts-morph**,
  writes vectors to Qdrant and the symbol graph (`CodeSymbol`/`CodeEdge`) to Postgres, and maintains
  the repository index lifecycle (`INDEXING → READY/FAILED` + counters). `index.ts` is the entry;
  `index-worker.ts`/`process-index-job.ts` do the work; `watch*.ts` provide file-watch reindex;
  `queues.ts`/`redis.ts` wire BullMQ. Graceful shutdown waits for the active job.
- **`mcp`** — the MCP server, with **two transports**:
  - `src/index.ts` — **local stdio** MCP (single-repo / local dev). `tools.ts`, `server.ts`, `context.ts`.
  - `src/http.ts` — **hosted MCP over Streamable HTTP** (`:8080`, path `/mcp` or `/mcp/{project-slug}`).
    `src/remote/` adds API-key `auth`, per-key + pre-auth-IP `rate-limit`, `services`, and `tools`
    (`registerRemoteTools`) that serve structural/graph tools straight from the **Postgres** index — so
    the hosted server needs none of the user's files. Clients authenticate with
    `Authorization: Bearer bd_…` and select a project via `X-Project: <slug|id>` or the URL path.
    The server ships `instructions` and tool `annotations` (`readOnlyHint` → auto-approval in clients).
- **`vscode-extension`** — `brain-dock-vscode`: VEXP-style panel (usage, period selector, indexing
  progress), auto-project from the open folder, upload-based indexing, inline settings, native VS Code
  MCP registration, Setup Agents for `~/.claude.json`/Cursor (atomic writes), i18n ru/en.

### Packages (`packages/*`, layered leaf→top)

- **`shared`** — shared types/utilities (leaf).
- **`core`** — cross-cutting infra (OpenTelemetry tracing setup, etc.).
- **`db`** — Prisma client (generated into `src/generated`) + `@prisma/adapter-pg`; the typed DB entry point.
- **`indexer`** — ts-morph parsing of code into symbols/edges; also ships a CLI (`brain-dock-index`).
- **`graph`** — symbol-dependency graph built on `indexer`.
- **`embedding`** — embedding providers (`deterministic` / `ollama`). `embed()` = documents,
  `embedQuery()` = queries; the ollama provider adds nomic task prefixes (`search_document:` /
  `search_query:`) and truncates input to the model context.
- **`storage`** — Qdrant vector store (`QdrantStore`, `VectorPoint`, `VectorDistance`). New collections
  are **hybrid** (named `dense` vector + sparse `bm25` with `modifier: idf`) with payload indexes
  (`projectId` is_tenant, `repo`, `path`); pre-existing single-vector collections are auto-detected
  and served in legacy dense-only mode until reindexed.
- **`search`** — hybrid search: dense + BM25 sparse fused with **server-side RRF** (Qdrant Query API),
  code-aware tokenizer (camelCase/snake_case), intent-aware context engine, `search_everywhere` with
  RRF across sources. Large classes are sub-chunked per method with breadcrumbs (see `indexer`).
  `eval/` is the search-quality harness (`bun run search:eval`).
- **`knowledge`** — memory/knowledge/documents domain + the server-side **`SymbolIndexService`** (powers
  remote `find_*`/architecture/impact/graph from Postgres) + **`buildRepoMap`** (Personalized PageRank
  repo map under a token budget); parses uploaded docs (`mammoth` for docx, `unpdf` for pdf).
  Depends on `db`, `embedding`, `graph`, `indexer`, `storage`.

### Data model (Prisma — [prisma/schema.prisma](../prisma/schema.prisma))

`User` (roles `USER`/`ADMIN`/`SUPER_ADMIN`; the **first registered user auto-becomes `SUPER_ADMIN`**) →
`Project` (unique `slug`; `profile` = pinned ≤4KB core-memory block prepended by `generate_context`) →
`Repository` (`alias` unique per project; `root` = filesystem path the workers index; index lifecycle:
`indexStatus` QUEUED/INDEXING/READY/FAILED + `indexError`/`lastIndexedAt`/counters). `ApiKey` stores a
sha256 `keyHash` + visible `prefix` and an optional per-key `rateLimit` (enforced by the hosted MCP).
`MemoryItem` / `KnowledgeItem` / `Document` are the per-project knowledge stores. `CodeSymbol` /
`CodeEdge` are the **server-side structural index** (scoped by `projectId`+`repo`, replaced wholesale
on each reindex) that lets the hosted MCP answer structural queries without the user's source.
`McpUsageDaily` is the per-user usage rollup. `AuditLog` records actor actions. All project/user-scoped
tables have **FK + ON DELETE CASCADE**; deleting a project also purges its Qdrant points
(`VectorCleanupService`).

### Infrastructure ([docker-compose.yml](../docker-compose.yml))

Postgres, Qdrant, Redis, Ollama always available — images **pinned** (no `:latest`), host ports bound
to `127.0.0.1`, credentials from `.env` (`POSTGRES_USER/PASSWORD/DB`), healthchecks + log rotation +
memory limits everywhere. The app services (`api`, `workers`, `mcp`) sit behind the `app` Compose
profile and are **built on the host** (no image registry, `USER bun`, `--frozen-lockfile`). One-shot
services: `migrate` (`prisma migrate deploy`, gates `api`/`mcp`) and `ollama-pull` (fetches the
embedding model). In-container env overrides point services at in-network DNS (e.g. `postgres:5432`),
while `.env` URLs point at the host ports above.

## MCP tools surfaced to clients

The MCP server publishes its tool list via `tools/list` (clients discover them automatically — no manual
listing) plus server `instructions`; read-only tools carry `readOnlyHint` annotations. Highlights:
`list_projects`, `search_code`, `generate_context` (prepends the project profile), `search_everywhere`,
`find_symbol`, `find_controller`/`find_service`/`find_module`/`find_guard`/`find_repository`,
`find_endpoint`, `summarize_project`, `get_architecture`, `find_dependencies`/`find_dependents`/`impact`,
`export_graph`, `repo_map` (PageRank map under a token budget), `index_status`/`trigger_reindex`,
`get_project_profile`/`update_project_profile`, `remember`/`search_memory`,
`save_knowledge`/`search_knowledge`, `save_document`/`search_docs`. Structural/graph tools require the
repository to be indexed first (check `index_status`).
**Note:** this is the product's *own* MCP server for end users — distinct from the **vexp** MCP tools
below, which you (the agent) use to navigate *this* codebase.

## vexp — Context-Aware AI Coding <!-- vexp v1.3.11 -->

### MANDATORY: use vexp pipeline — do NOT grep or glob the codebase
For every task — bug fixes, features, refactors, debugging:
**call `run_pipeline` FIRST**. It executes context search + impact analysis +
memory recall in a single call, returning compressed results.

Do NOT use grep, glob, Bash, or cat to search/explore the codebase.
vexp returns pre-indexed, graph-ranked context that is more relevant and
uses fewer tokens than manual searching. Prefer `get_skeleton` over Read to
inspect files (detail: minimal/standard/detailed, 70-90% token savings).
Only use Read when you need exact raw content to edit a specific line.

### Primary Tool
- `run_pipeline` — **USE THIS FOR EVERYTHING**. Single call that runs
  capsule + impact + memory server-side. Returns compressed results.
  Auto-detects intent (debug/modify/refactor/explore) from your task.
  Includes full file content for pivots.
  Examples:
  - `run_pipeline({ "task": "fix JWT validation bug" })` — auto-detect
  - `run_pipeline({ "task": "refactor db layer", "preset": "refactor" })` — explicit
  - `run_pipeline({ "task": "add auth", "observation": "using JWT" })` — save insight in same call

### Other MCP tools (use only when run_pipeline is insufficient)
- `get_context_capsule` — lightweight alternative for simple questions only
- `get_impact_graph` — standalone deep impact analysis of a specific symbol
- `search_logic_flow` — trace execution paths between two specific symbols
- `get_skeleton` — **preferred over Read** for inspecting files (minimal/standard/detailed detail levels, 70-90% token savings)
- `index_status` — indexing status and health check
- `get_session_context` — recall observations from current/previous sessions
- `search_memory` — cross-session search for past decisions
- `save_observation` — persist insights (prefer using run_pipeline's observation param instead)

### Workflow
1. `run_pipeline("your task")` — ALWAYS FIRST. Returns pivots + impact + memories in 1 call
2. Need more detail on a file? Use `get_skeleton({ files: [...], detail: "detailed" })` — avoid Read unless editing
3. Make targeted changes based on the context returned
4. `run_pipeline` again ONLY if you need more context during implementation
5. Do NOT chain multiple vexp calls — one `run_pipeline` replaces capsule + impact + memory + observation

### Subagent / Explore / Plan mode
- Subagents CAN and MUST call `run_pipeline` — always include the task description
- The PreToolUse hook blocks Grep/Glob when vexp daemon is running
- Do NOT spawn Agent(Explore) to freely search — call `run_pipeline` first,
  then pass the returned context into the agent prompt if needed
- Always: `run_pipeline` → get context → spawn agent with context

### Smart Features (automatic — no action needed)
- **Intent Detection**: auto-detects from your task keywords. "fix bug" → Debug, "refactor" → blast-radius, "add" → Modify
- **Hybrid Search**: keyword + semantic + graph centrality ranking
- **Session Memory**: auto-captures observations; memories auto-surfaced in results
- **LSP Bridge**: VS Code captures type-resolved call edges
- **Change Coupling**: co-changed files included as related context

### Advanced Parameters
- `preset: "debug"` — forces debug mode (capsule+tests+impact+memory)
- `preset: "refactor"` — deep impact analysis (depth 5)
- `max_tokens: 12000` — increase total budget for complex tasks
- `include_tests: true` — include test files in results
- `include_file_content: false` — omit full file content (lighter response)

### Multi-Repo Workspaces
`run_pipeline` auto-queries all indexed repos. Use `repos: ["alias"]` to scope.
Use `index_status` to discover available repo aliases.
<!-- /vexp -->