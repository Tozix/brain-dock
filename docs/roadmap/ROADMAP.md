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

## Production readiness ✅
- ✅ CI (GitHub Actions): Biome + typecheck + тесты на push/PR.
- ✅ Dockerfiles для `apps/{api,mcp,workers}`; образ API собран и проверен (`/health` 200 в контейнере).
- ✅ Деплой сборкой на сервере (без registry): `bun run deploy` =
  `docker compose --profile app up -d --build` (api+workers за профилем `app`). Публикация
  образов в registry **снята** — вернуться к ней только при multi-node/k8s ([план 025](../plans/025-deploy-build-on-server.md)).
- ✅ OpenTelemetry-трейсинг (opt-in, api+workers, [026](../plans/026-otel-tracing.md)/[028](../plans/028-otel-workers.md)) и e2e-CI с реальными сервисами ([027](../plans/027-e2e-ci.md)).
- **План:** [007-production-readiness.md](../plans/007-production-readiness.md) (Done)

## Multi-Repo ✅
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
- ✅ Кросс-репо граф ([023](../plans/023-cross-repo-graph.md)), repositories в OpenAPI
  ([021](../plans/021-repositories-openapi.md)), горячее переподнятие watcher'ов ([024](../plans/024-watch-resubscribe.md)).
- **Планы:** [015](../plans/015-multi-repo.md) (Done) · [016](../plans/016-multi-repo-rest.md) (Done) · [017](../plans/017-multi-repo-watch.md) (Done)

## Hosted MCP + наблюдаемость ✅
**Цель:** хостинговая модель (vexp.dev-style) — удалённый MCP по HTTP поверх серверного индекса.
- ✅ Удалённый MCP по Streamable HTTP (`apps/mcp/src/http.ts`, `:8080/mcp`), auth по API-ключу,
  per-key rate-limit, серверный индекс символов в Postgres (`CodeSymbol`/`CodeEdge`), remote
  структурные/граф-tools без файлов пользователя, OTel context-propagation api→queue→worker.
- **Планы:** [036](../plans/036-remote-mcp-http.md)…[040](../plans/040-mcp-rate-limit.md) (Done).

## Сквозная верификация ✅
**Цель:** доказать, что hosted-путь из [GUIDE.md](../GUIDE.md) работает end-to-end, не только в юнит-тестах.
- ✅ Полный путь вживую на реальной инфре: REST-auth → API-ключ → проект/репозиторий → индексация
  (воркер → 247 символов/86 рёбер в Postgres + векторы в Qdrant) → remote MCP по HTTP (все 23 tools
  отдают корректные данные, auth+`X-Project`+rate-limit работают).
- ✅ Все `RUN_E2E` e2e проходят против реальных сервисов (6 pass); Biome warnings 11 → 0; CI зелёный.
- **План:** [041-e2e-verification-and-improvements.md](../plans/041-e2e-verification-and-improvements.md) (Done)

## Client — VSCode extension ✅
**Цель:** клиент-«одна кнопка»: подключение к hosted brain-dock без ручного редактирования конфигов.
- ✅ `apps/vscode-extension`: боковая панель (статус индекса, Token Savings, период Today/7/30/90),
  Connect по API-ключу (SecretStorage), выбор/автосоздание проекта из workspace, **Setup Agents**
  (прописывает remote MCP в Claude Code/Cursor; атомарная запись конфигов), нативная регистрация MCP,
  Force Re-index с видимым прогрессом.
- **Планы:** [042](../plans/042-vscode-extension.md) · [043](../plans/043-vscode-extension-polish.md) ·
  [044](../plans/044-vscode-extension-inline-settings.md) · [045](../plans/045-vscode-auto-project-from-workspace.md) ·
  [047](../plans/047-vexp-like-panel-honest-usage.md) · [048](../plans/048-native-vscode-mcp-registration.md) ·
  [049](../plans/049-panel-period-selector-and-indexing-progress.md) (все Done)

## Indexing from uploads ✅
**Цель:** hosted-индексация без доступа к файловой системе сервера и без git.
- ✅ `POST /projects/:pid/repositories/:id/index` — клиент выгружает файлы (контент в теле),
  сервер индексирует их напрямую; VSCode-расширение делает это автоматически. Бюджет
  `INDEX_UPLOAD_MAX_TOTAL_BYTES`; реиндекс по серверному пути в prod закрыт `INDEX_SERVER_PATHS=false`.
- **План:** [046-index-uploaded-files-no-git.md](../plans/046-index-uploaded-files-no-git.md) (Done)

## Search/Embedding fixes ✅
- ✅ Ollama-эмбеддинги: усечение входа до контекста модели (`maxChars`, фикс 400 при индексации);
  dev-режим с реальным Ollama.
- **План:** [050-ollama-embedding-truncation-and-dev-ollama.md](../plans/050-ollama-embedding-truncation-and-dev-ollama.md) (Done)

## Hardening / закрытие аудита ✅
**Цель:** закрыть 102 находки аудита (безопасность, надёжность, эксплуатация).
- ✅ Prisma: FK + ON DELETE CASCADE (memory/knowledge/documents/code_symbols/code_edges/mcp_usage_daily),
  индекс `audit_logs(created_at)`; удаление проекта чистит Qdrant-точки.
- ✅ API: глобальный exception filter `{code,message,details?}`, пагинация `take`/`skip`,
  `GET /audit` (ADMIN+), `TRUST_PROXY`, security-заголовки + `CORS_ORIGINS`, `/metrics` за
  `METRICS_TOKEN`, HS256-pin, `INDEX_SERVER_PATHS`, лимиты контента, компенсация двойной записи.
- ✅ Qdrant point id скоупирован `projectId:repo` (фикс кросс-тенант перезаписи); полный reindex
  вычищает осиротевшие точки.
- ✅ MCP HTTP: generic-ошибки клиенту, таймаут → 504, pre-auth IP-лимит, лимит тела → 413,
  per-key rate limit (`ApiKey.rateLimit`), graceful shutdown, e2e по HTTP.
- ✅ Compose: запиненные образы, healthchecks, 127.0.0.1-биндинги, лог-ротация, mem-лимиты, `USER bun`.
- ✅ Тесты: 155 → 353 pass.
- **План:** [051-audit-closure.md](../plans/051-audit-closure.md) (Done)

## Search quality ✅
**Цель:** измеримо поднять качество поиска по коду.
- ✅ `embedQuery` + task-префиксы nomic (`search_document:`/`search_query:`); суб-чанкинг крупных
  классов (порог 6000, breadcrumb `file > Class`); hybrid-коллекции Qdrant (named dense + sparse BM25
  idf, server-side RRF, code-aware токенизатор; legacy — dense-only до реиндекса); payload-индексы;
  `search_everywhere` на RRF; eval-harness `packages/search/eval` (`bun run search:eval`).
- ✅ Метрики eval: nDCG@10 0.543→**0.620**, MRR 0.551→**0.561**, Recall@5 0.604→**0.813**, промахи 14→3.
- **План:** [052-search-quality.md](../plans/052-search-quality.md) (Done)

## MCP UX ✅
**Цель:** сделать hosted MCP удобным «из коробки» для AI-клиентов.
- ✅ `instructions` сервера (оба транспорта), `readOnlyHint`-аннотации (авто-одобрение в клиентах),
  переписанные описания tools; выбор проекта URL-путём `/mcp/{slug-or-id}` (приоритетнее `X-Project`).
- ✅ Новые tools: `get_project_profile`/`update_project_profile` (профиль ≤4КБ, подмешивается в
  `generate_context`), `index_status`, `trigger_reindex` (дедуп при QUEUED/INDEXING), `repo_map`
  (Personalized PageRank по `CodeSymbol`/`CodeEdge` под токен-бюджет; есть и в локальном stdio MCP).
- ✅ REST: `GET`/`PUT /projects/:id/profile`, `GET …/repositories/:id/status`; Prisma:
  `Project.profile`, `Repository.indexStatus`/`indexError`/`lastIndexedAt`/`indexedFileCount`/`symbolCount`.
- **План:** [053-mcp-ux.md](../plans/053-mcp-ux.md) (Done)

---

## Web — веб-кабинет + админка ✅
**Цель:** self-service через браузер (без curl и без админа) + продакшен-вход через host-nginx.
- ✅ SPA (Vite + React 19, дизайн-система «инженерная консоль», русский UI): регистрация/вход,
  дашборд проектов, страница проекта (репозитории + статус индексации + загрузка папки из браузера,
  профиль, память/знания/документы, usage), self-service API-ключи, «Подключить MCP» (готовые
  конфиги Claude Code / VS Code / Cursor), админка (пользователи/аудит/usage).
- ✅ REST: модуль `users` (ADMIN+), self-service политика api-keys, `GET /usage/admin`.
- ✅ Контейнер `web` (:3300) + публикации app-сервисов только на 127.0.0.1; host-nginx конфиг
  `deploy/nginx/brain-dock.ru.conf` (TLS certbot, `/`→web, `/api/v1`→api, `/mcp`→mcp/SSE).
- **План:** [054-web-ui.md](../plans/054-web-ui.md) (Done)

## Дальше (backlog)
- Git-подключение репозиториев (clone/pull вместо upload/серверного пути).
- Биллинг/квоты по usage (веб-кабинет уже есть — план 054).
- Redis-backed rate limit для MCP (общий между инстансами).
- Ротация refresh-токенов.
- Структурное логирование (pino).
- ✅ Бэкапы: pg_dump + Qdrant snapshots (автоматизация) — план [056](../plans/056-automated-backups.md)
  (`bun run backup` + `scripts/restore.sh`, [BACKUP.md](../deployment/BACKUP.md)).
- Очередь для upload-индексации (сейчас — синхронно в запросе).
- Change-coupling (co-changed files) в контексте.
