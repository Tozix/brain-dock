# RAG / Context Engine

Гибридный поиск и сбор контекста. План — [../plans/003-rag-engine.md](../plans/003-rag-engine.md).

## Phase 3 (готово) — Embedding & Vector Storage + поиск
Поток: `Repository → indexer chunks → EmbeddingProvider → Qdrant → search`.

- **Ingestion** (`@brain-dock/search` `IngestionService`): индексирует репозиторий (`@brain-dock/indexer`),
  эмбеддит чанки, апсертит точки в Qdrant. Payload: `projectId, path, symbol, kind, role,
  startLine, endLine, model, text`. Point id — UUID из sha256 чанка (стабильные апсерты).
- **Хранилище** (`@brain-dock/storage` `QdrantStore`): `ensureCollection`/`upsert`/`search`,
  distance Cosine, изоляция проектов фильтром по `projectId`.
- **Поиск** (`SearchService`): vector similarity (Qdrant) + лёгкий keyword-boost
  (`0.7·vector + 0.3·keyword`). Коллекция `code`.
- **Воркер** (`apps/workers` `IndexWorker`, BullMQ): очередь `brain-dock-index`, job
  `{projectId, rootDir, collection}` → ingestion.

### Проверено вживую (на `apps/api`, 27 файлов / 32 чанка)
- Deterministic-провайдер и **реальный Ollama `nomic-embed-text`** дают релевантную выдачу
  на запрос «jwt access token authentication guard» (топ — `JwtAccessGuard`, `AuthController`, `AuthService`).
- BullMQ работает на Bun (см. [../backend/bun-nestjs-notes.md](../backend/bun-nestjs-notes.md) §BullMQ).

Демо: `bun apps/workers/src/rag-demo.ts ["query"]` (`EMBEDDER=ollama` — реальная модель).

## Phase 4 (готово) — Context Engine
`ContextEngine` (`@brain-dock/search`): `query → intent → retrieve → intent-aware re-rank →
dedupe → compress → assemble`.

- **Intent detection** (`detectIntent`): debug / modify / refactor / explore (эвристики), с
  per-role бустами (например, debug → +service/+controller/+guard).
- **Re-ranking**: `score · (1 + roleBoost[role])` — metadata-fusion по роли символа из индексатора.
- **Compression**: дедуп по `path#symbol`, обрезка сниппета по строкам, бюджет по символам.
- **Context Builder**: markdown-блок с заголовками `path:line — role symbol (score)` и сниппетами.

Демо: `bun apps/workers/src/context-demo.ts ["query"]` (`EMBEDDER=ollama`). Проверено вживую:
запрос «why does jwt authentication fail in the guard» → intent=debug, топ `AuthService` (буст), 5/15 включено, бюджет ~3.8k символов.

### Далее (за рамками Phase 4)
Полноценный BM25/full-text, графовое расширение (DI-соседи через `packages/graph`),
knowledge-слияние, обучаемый re-ranker. Отдаётся клиентам через MCP — [план 004](../plans/004-mcp-server.md).
