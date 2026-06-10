# RAG / Context Engine

Гибридный поиск и сбор контекста. План — [../plans/003-rag-engine.md](../plans/003-rag-engine.md).

## Phase 3 (готово) — Embedding & Vector Storage + поиск
Поток: `Repository → indexer chunks → EmbeddingProvider → Qdrant → search`.

- **Ingestion** (`@brain-dock/search` `IngestionService`): индексирует репозиторий (`@brain-dock/indexer`),
  эмбеддит чанки, апсертит точки в Qdrant. Payload: `projectId, path, symbol, kind, role,
  startLine, endLine, model, text`. Point id — UUID из sha256 чанка (стабильные апсерты).
- **Хранилище** (`@brain-dock/storage` `QdrantStore`): `ensureCollection`/`upsert`/`search`/
  `hybridQuery`, distance Cosine, изоляция проектов фильтром по `projectId` (+ payload-индексы
  `projectId` (is_tenant) / `repo` / `path`). Новые коллекции создаются в **hybrid-формате**:
  named dense-вектор + sparse **BM25**-вектор (`modifier: idf`); legacy-коллекции (один безымянный
  dense) продолжают работать в dense-only режиме до реиндекса.
- **Поиск** (`SearchService`, план [052](../plans/052-search-quality.md)): на hybrid-коллекциях —
  dense + sparse BM25 со слиянием **server-side RRF** (Qdrant Query API), code-aware токенизатор
  (`tokenizeCode`: camelCase/snake_case-разбиение); на legacy — vector similarity + лёгкий
  keyword-boost (`0.7·vector + 0.3·keyword`). Запросы эмбеддятся через `embedQuery`
  (task-префикс `search_query:` у nomic; см. [../embedding/](../embedding/README.md)).
- **Воркер** (`apps/workers` `IndexWorker`, BullMQ): очередь `brain-dock-index`, job
  `{projectId, rootDir, collection}` → ingestion.

### Проверено вживую (на `apps/api`, 27 файлов / 32 чанка)
- Deterministic-провайдер и **реальный Ollama `nomic-embed-text`** дают релевантную выдачу
  на запрос «jwt access token authentication guard» (топ — auth-guard, `AuthController`,
  `AuthService`; сейчас guard называется `AuthenticationGuard`, план 033).
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
- **Graph-обогащение** (опц. `neighbors`-хук): DI-зависимости символа подмешиваются как boost
  (соседи топ-хитов поднимаются) и аннотируются строкой `related:` в каждом блоке. В MCP
  `generate_context` хук = `SymbolGraph.dependencies` (см. [../architecture/](../architecture/README.md)).

Демо: `bun apps/workers/src/context-demo.ts ["query"]` (`EMBEDDER=ollama`). Проверено вживую:
запрос «why does jwt authentication fail in the guard» → intent=debug, топ `AuthService` (буст), 5/15 включено, бюджет ~3.8k символов.

## Unified Search (готово) — `search_everywhere`
`UnifiedSearchService`: один запрос по code + memory + knowledge + documents, объединённый
ранжированный список. Источники имеют несравнимые шкалы score, поэтому слияние идёт по
**Reciprocal Rank Fusion** (RRF, `k=60`) с весами источников: каждый результат получает
`w_src / (k + rank)` — ранги вместо сырых score, ни один источник не доминирует из-за своей
шкалы (заменило min-max-нормализацию из плана
[020](../plans/020-score-normalization.md); `rawScore` сохранён для отображения).
Падающий источник не валит весь запрос. План — [052](../plans/052-search-quality.md).

## Качество поиска: eval-harness (план [052](../plans/052-search-quality.md))
`packages/search/eval/` — golden-set запросов (`golden.json`) + `bun run search:eval`
(метрики nDCG@10 / MRR / Recall@5). Результат плана 052: nDCG@10 0.543→**0.620**,
MRR 0.551→**0.561**, Recall@5 0.604→**0.813**, полных промахов 14→3. Помог и суб-чанкинг крупных
классов в индексаторе (порог 6000 символов, чанки методов с breadcrumb `file > Class`).

### Далее
Графовое расширение retrieval (DI-соседи через `packages/graph` уже подмешиваются в
`generate_context`), knowledge-слияние, обучаемый re-ranker, change-coupling —
см. [backlog](../roadmap/ROADMAP.md#дальше-backlog).
