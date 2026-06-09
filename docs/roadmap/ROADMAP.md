# Roadmap — `brain-dock`

Дорожная карта платформы. Каждая фаза опирается на план(ы) в [../plans/](../plans/).
Легенда статусов: ✅ готово · 🔄 в работе · ⏭️ следующее · ⬜ запланировано.

---

## Phase 0 — Bootstrap ✅
**Цель:** подготовить проект до написания бизнес-логики.
- ✅ `.gitignore`, инициализация репозитория.
- ✅ ADR-0001: выбор стека (Bun-runtime + NestJS, Turborepo + Bun workspaces).
- ✅ Корневой `Claude.md`, структура `/docs`, ROADMAP, планы 000–004.
- ✅ Подтверждение архитектуры пользователем; правило Context7 + latest stable.
- **План:** [000-bootstrap.md](../plans/000-bootstrap.md)

## Phase 1 — Foundation ✅
**Цель:** рабочий каркас монорепо и инфраструктура разработки.
- ✅ Turborepo + Bun workspaces, `apps/{api,mcp,workers}` и `packages/{shared,core,db}`.
- ✅ Biome, корневой tsconfig, скрипты (build/test/lint/format/db/infra).
- ✅ Docker Compose: PostgreSQL, Qdrant, Redis, Ollama (нестандартные host-порты).
- ✅ Prisma 7 init + миграция (users, projects, api_keys, audit_log), pg-adapter, runtime bun.
- ✅ NestJS-bootstrap (`apps/api`) на Bun, `/health` + `/health/ready`, Zod-конфиг.
- ✅ Auth-скелет: JWT + refresh, RBAC, API-keys (Super Admin), audit — проверено вживую.
- ✅ Runtime smoke-gate зелёный (ADR-0001); находки — docs/backend/bun-nestjs-notes.md.
- **План:** [001-foundation.md](../plans/001-foundation.md) (Done)

## Phase 2 — Indexer ✅
**Цель:** превратить репозиторий в граф символов.
- ✅ AST-движок ts-morph за интерфейсом `AstEngine`; пакет `@brain-dock/indexer`.
- ✅ Repository → Files → AST → Symbols → Chunks; NestJS-роли, DI-связи, маршруты, импорты.
- ✅ Хэш-based инкрементальная индексация; CLI; тесты + проверка на `apps/api`.
- ⏭️ Отложено: запись в БД/эмбеддинги (Phase 3), полный граф/change-coupling.
- **План:** [002-indexer.md](../plans/002-indexer.md) (Done)

## Phase 3 — Embedding & Vector Storage ✅
**Цель:** локальные эмбеддинги, векторное хранилище, базовый поиск.
- ✅ `EmbeddingProvider`: `OllamaEmbeddingProvider` (`nomic-embed-text`, 768d, батчи) +
  `DeterministicEmbeddingProvider` (оффлайн/тесты). Версия модели в payload.
- ✅ `QdrantStore` (`@brain-dock/storage`): коллекция `code`, Cosine, изоляция по `projectId`.
- ✅ Ingestion-pipeline (`@brain-dock/search`): indexer → embed → Qdrant.
- ✅ Гибрид (мост): vector + keyword-boost. Проверено вживую (deterministic + реальный Ollama).
- ✅ BullMQ `IndexWorker` (`apps/workers`); риск BullMQ-на-Bun закрыт (postinstall-фикс).
- **План:** [003-rag-engine.md](../plans/003-rag-engine.md) (Phase 3 — Done)

## Phase 4 — Context Engine ✅
**Цель:** качественный сбор контекста.
- ✅ Intent detection (debug/modify/refactor/explore) + per-role бусты.
- ✅ Intent-aware re-ranking (metadata-fusion по роли), дедуп, compression, Context Builder.
- ✅ `ContextEngine` (`@brain-dock/search`); проверено вживую (intent=debug → топ AuthService).
- ⏭️ Далее: BM25/full-text, графовое расширение (DI-соседи), knowledge-слияние, обучаемый re-ranker.
- **План:** [003-rag-engine.md](../plans/003-rag-engine.md) (Phase 4 — Done)

## Phase 5 — MCP Server ✅
**Цель:** совместимый MCP-сервер для Claude Code/Cursor/VSCode.
- ✅ `apps/mcp` на `@modelcontextprotocol/sdk` v1 (stdio); 9 tools
  (reindex/search_code/generate_context/find_*/summarize_project/get_architecture).
- ✅ Проверено реальным MCP-клиентом + in-process тестом; [docs/mcp/](../mcp/README.md).
- ⏭️ Далее: resources/prompts, auth по API-ключу, memory/knowledge-tools (Phase 6).
- **План:** [004-mcp-server.md](../plans/004-mcp-server.md) (Done)

## Phase 6 — Knowledge Base & Project Memory ✅
**Цель:** хранение знаний и долговременной памяти.
- ✅ Prisma `MemoryItem`/`KnowledgeItem` + миграция; пакет `@brain-dock/knowledge`.
- ✅ Postgres (source of truth) + Qdrant (`memory`/`knowledge`) семантический поиск; изоляция по `projectId`.
- ✅ MCP-tools: `remember`/`search_memory`/`list_memory`/`save_knowledge`/`search_knowledge` — проверено вживую.
- ⏭️ Далее: документы (md/pdf/docx), update/delete, REST API, объединённый поиск в Context Engine.
- **План:** [005-knowledge-memory.md](../plans/005-knowledge-memory.md) (Done)

## Phase 7 — Multi-Project, REST & Hardening ✅
**Цель:** изоляция, REST-доступ, готовность к проду.
- ✅ `ProjectsModule` (REST, owner-scoped) + проверка владения (owner/ADMIN).
- ✅ Project-scoped REST для памяти/знаний поверх `@brain-dock/knowledge` (изоляция по `projectId`).
- ✅ Глобальный rate limit (fixed-window, конфиг через env) + audit. Проверено вживую (429).
- ⏭️ Далее: multi-repo индексация, метрики/нагрузочное тестирование, Redis-backed rate limit,
  документы (md/pdf/docx), Swagger/OpenAPI, update/delete для knowledge.
- **План:** [006-multiproject-rest-hardening.md](../plans/006-multiproject-rest-hardening.md) (Done)

## Production readiness (backlog) 🔄
- ✅ CI (GitHub Actions): Biome + typecheck + тесты на push/PR.
- ✅ Dockerfiles для `apps/{api,mcp,workers}`; образ API собран и проверен (`/health` 200 в контейнере).
- ⏭️ Далее: публикация образов, Swagger/OpenAPI, метрики/трейсинг, Redis-backed rate limit,
  документы (md/pdf/docx), multi-repo, e2e-CI с сервисами.
- **План:** [007-production-readiness.md](../plans/007-production-readiness.md) (Done)

## Multi-Repo (backlog) 🔄
**Цель:** индексировать и искать сразу по нескольким репозиториям одного проекта.
- ✅ Движок + MCP: `repo` (alias) в payload, фильтр `repos[]` (`SearchService`/`ContextEngine`/
  `UnifiedSearch`), пер-репо индексы/графы в `McpContext`, tool `list_repos`, `repos?`/`repo?` в
  tools, агрегация структурных tools с префиксом alias. Фикс изоляции `deletePath`
  (projectId+repo+path). Конфиг репо через env `REPOS` (JSON).
- ✅ Prisma `Repository` (`@@unique([projectId, alias])`) + миграция; `repositoryId` (uuid) в payload.
- ✅ REST `RepositoriesController` (owner-scoped CRUD + `POST …/reindex`), индексация через BullMQ
  (`IndexQueue`-порт в `@brain-dock/core`, продьюсер в API). Проверено вживую (409, CRUD, очередь в Redis).
- ✅ Мульти-репо watch-воркер `watch-all` (читает `Repository` из БД, по watcher'у на репо,
  инкрементальный реиндекс с `repo`+`repositoryId`). Проверено вживую.
- ⏭️ Далее: кросс-репо граф, repositories в OpenAPI, горячее переподнятие watcher'ов.
- **Планы:** [015](../plans/015-multi-repo.md) (Done) · [016](../plans/016-multi-repo-rest.md) (Done) · [017](../plans/017-multi-repo-watch.md) (Done)
