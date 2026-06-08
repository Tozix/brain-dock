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

## Phase 4 (далее) — Context Engine
Intent detection → AST/knowledge/metadata-слияние → re-ranking → context compression →
Context Builder. Полноценный BM25/full-text вместо текущего keyword-boost.
