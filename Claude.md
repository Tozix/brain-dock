# Claude.md — Главный документ проекта `brain-dock`

> Это **главный источник истины** проекта. Любая разработка сверяется с этим файлом.
> Он обновляется после **каждой** завершённой задачи (см. раздел «Правила работы с документацией»).
>
> Связанные файлы:
> - Технические инструкции для Claude Code: [.claude/CLAUDE.md](.claude/CLAUDE.md)
> - Дорожная карта: [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md)
> - Реестр решений (ADR): [docs/adr/README.md](docs/adr/README.md)
> - Реестр планов: [docs/plans/README.md](docs/plans/README.md)

**Статус:** продукт работает end-to-end в hosted-модели (удалённый MCP по HTTP поверх серверного
индекса; клиенты — Claude Code/Cursor/VSCode-расширение). Все планы **000–057 — Done**
(см. [docs/plans/README.md](docs/plans/README.md)); дальнейшее — в
[backlog](docs/roadmap/ROADMAP.md#дальше-backlog).
**Дата последнего обновления:** 2026-06-21.

---

## 1. Описание проекта

`brain-dock` — это **AI Knowledge Platform** и **MCP-сервер**: локальный «второй мозг»
для программных проектов. Система не просто выполняет RAG по файлам — она строит
структурированное понимание проекта: исходный код, архитектуру, бизнес-логику,
документацию, ADR, историю решений и связи между модулями.

Платформа предоставляет:
- **MCP Server** — совместимый с Claude Code, Cursor, VSCode и другими MCP-клиентами.
- **REST API** (versioned, `/api/v1`, Swagger/OpenAPI).
- **Project Memory** — долговременная память проекта (решения, факты, заметки, TODO).
- **Knowledge Base** — бизнес-правила, архитектура, требования, ADR, FAQ, roadmap.
- **Hybrid Search** — keyword + vector + AST + knowledge + metadata + re-ranking + compression.
- **AST-индексатор** — извлекает символы (controllers, services, modules, DTO, classes,
  functions, Prisma models, routes, guards, pipes …), а не «слепые» чанки.
- **Embedding Engine** — полностью локальный (Ollama), за единым интерфейсом `EmbeddingProvider`.
- **Background Workers** — BullMQ index-worker + watch-реиндекс, инкрементальная индексация.
- **Multi-Project / Multi-Repository** — полная изоляция индексов, документов, памяти.
- **Auth & Administration** — JWT + refresh, API-ключи (создаёт только Super Admin), RBAC, rate limit, audit log.

## 2. Философия проекта

- **Local-first.** Все вычисления и данные — локально. Никакой обязательной облачной зависимости.
- **Понимание, а не нарезка.** Индексатор оперирует символами и связями, а не строками.
- **Контекст собирается автоматически.** Intent → Hybrid Search → ReRank → Compression → Context.
- **Модульность и расширяемость.** Каждый модуль автономен; новые провайдеры/коллекции добавляются через интерфейсы.
- **Production-ready и open-source-ready.** Качество кода уровня enterprise, готовность к публичному развитию.
- **Никакого кода без анализа и плана.** Процесс важнее скорости (см. раздел 5).

## 3. Архитектура (высокоуровнево)

Поток индексации:

```
Repository → Files → AST → Symbols → Chunks → Embeddings → Qdrant
```

Поток контекста (запрос → ответ MCP):

```
User Query → Intent Detection → Hybrid Search → ReRanking → Compression → Context Builder → MCP → Claude Code
```

Граф знаний (Knowledge Graph) хранит связи: `Controller → Service → Repository → Prisma → Database`,
а также связи между документами, классами, функциями, API и бизнес-правилами.

Детальные диаграммы и описания слоёв — в [docs/architecture/](docs/architecture/).

## 4. Стек

| Слой              | Технология                          |
|-------------------|-------------------------------------|
| Runtime           | **Bun** (NestJS запускается на Bun) |
| Framework         | NestJS                              |
| ORM               | Prisma                              |
| Database          | PostgreSQL                          |
| Vector Database   | Qdrant                              |
| Embedding         | Ollama (`nomic-embed-text` по умолчанию) |
| Queue             | BullMQ + Redis                      |
| Validation        | Zod (v4)                            |
| Testing           | `bun:test` (Vitest-compatible API; ADR-0002) |
| Formatting/Lint   | Biome (v2)                          |
| Monorepo          | **Turborepo + Bun workspaces**      |
| Container         | Docker + Docker Compose             |

Обоснование и риски выбора стека (в частности NestJS-на-Bun) — в
[docs/adr/0001-stack-selection.md](docs/adr/0001-stack-selection.md).

### Embedding
Все embedding-модели работают локально через Ollama. По умолчанию — `nomic-embed-text`.
Архитектура поддерживает `bge`, `mxbai`, `snowflake` и любые будущие модели через
единый интерфейс `EmbeddingProvider`.

### Vector Storage (Qdrant collections)
Фактически 4 коллекции: **код** (имя из env `COLLECTION`, по умолчанию `code`), `memory`,
`knowledge`, `documents`. Новые коллекции создаются в hybrid-формате (named dense + sparse BM25,
server-side RRF — план 052); изоляция пользователей/проектов — фильтром по `projectId` в payload.

## 5. Правила разработки (ГЛАВНОЕ ПРАВИЛО)

**Никогда не писать код без предварительного анализа и плана.** Процесс:

1. Анализ задачи
2. Анализ существующей структуры проекта
3. Формирование плана
4. Сохранение плана в `docs/plans/NNN-name.md`
5. Подтверждение архитектуры с пользователем
6. Реализация
7. Тестирование
8. Самостоятельный рефакторинг
9. Обновление документации (docs, roadmap, Claude.md, план; ADR при необходимости)

**Запрещается писать код без существующего плана** в `docs/plans`.

### Зависимости и документация (Context7 + свежие стабильные версии)
- **Как можно чаще использовать Context7** (`resolve-library-id` → `query-docs`) для сверки с
  актуальной документацией и API библиотек **перед** их использованием или добавлением.
  Не полагаться на знания по памяти — API NestJS/Prisma/BullMQ/Qdrant/Zod/Biome/Turborepo меняются.
- Все зависимости ставятся в **последней стабильной** (latest stable) версии. Pre-release
  (beta/rc/canary) — только по явному согласованию с пользователем.
- Разделение инструментов: **vexp** — контекст нашего кода; **Context7** — документация внешних библиотек.

### Принципы кода
Clean Architecture, DDD, SOLID, KISS, DRY, YAGNI, Composition over Inheritance, Dependency Injection.

### Проверка перед каждым commit
Типизация · Линтер (Biome) · Тесты (`bun:test`) · Сборка · Архитектурные нарушения · Дублирование кода.
Единый локальный прогон: `bun run ci`.

### Общение
Любые уточняющие вопросы — **на русском**, с развёрнутым объяснением каждого варианта и явной рекомендацией
(рекомендованный — первым, с пометкой «(рекомендую)»). См. [.claude/CLAUDE.md](.claude/CLAUDE.md).

## 6. Соглашения по именованию

- **Файлы:** `kebab-case` (`embedding.provider.ts`, `index.worker.ts`).
- **NestJS-артефакты:** суффиксы по типу — `*.controller.ts`, `*.service.ts`, `*.module.ts`,
  `*.dto.ts`, `*.guard.ts`, `*.pipe.ts`, `*.repository.ts`, `*.worker.ts`.
- **Классы/типы/интерфейсы/enums:** `PascalCase`. Интерфейсы — **без** префикса `I`.
- **Переменные/функции:** `camelCase`. Константы окружения: `SCREAMING_SNAKE_CASE`.
- **Пакеты монорепо:** `@brain-dock/<name>` (например `@brain-dock/core`).
- **Самодокументируемые имена.** Минимум комментариев — код объясняет себя сам.

## 7. Структура каталогов (целевая)

```
apps/
  api/               # REST API (NestJS)
  mcp/               # MCP-сервер: hosted Streamable HTTP (src/http.ts) + локальный stdio (src/index.ts)
  workers/           # BullMQ index-worker + watch/watch-all реиндекс
  vscode-extension/  # клиент: панель статуса/usage, Connect по API-ключу, Setup Agents
packages/
  shared/      # общие утилиты, типы, Zod-схемы (leaf)
  core/        # сквозная инфраструктура (OTel-трейсинг, порт IndexQueue, …)
  db/          # Prisma-клиент (generated) + pg driver adapter
  indexer/     # AST-индексатор (ts-morph) + CLI
  graph/       # граф зависимостей символов (SymbolGraph)
  embedding/   # EmbeddingProvider и реализации (ollama/deterministic)
  storage/     # Qdrant-стор (hybrid dense+BM25)
  search/      # Hybrid Search + Context Engine + unified search (+ eval/)
  knowledge/   # memory/knowledge/documents + SymbolIndexService + UsageService
prisma/        # схема и миграции
docs/          # вся документация (см. docs/README.md)
```

> **4 приложения и 9 пакетов — все рабочие.** `prisma/` — схема + миграции.
> AST-индексатор — [docs/architecture/indexer.md](docs/architecture/indexer.md);
> RAG/Context Engine — [docs/rag/](docs/rag/); MCP — [docs/mcp/](docs/mcp/);
> особенности Bun (NestJS, BullMQ) — [docs/backend/bun-nestjs-notes.md](docs/backend/bun-nestjs-notes.md).

## 8. Правила работы с документацией

- Вся документация хранится в `/docs` (структура — в [docs/README.md](docs/README.md)).
- После завершения **каждой** задачи: обновить `docs`, `ROADMAP`, `Claude.md`, соответствующий план; при необходимости создать ADR.
- Документация — часть Definition of Done, а не «потом».

## 9. Правила создания миграций (Prisma)

- Все изменения схемы — **только через миграции**. Ручная правка БД/схемы запрещена.
- Имя миграции описывает намерение (`add_api_keys`, `index_symbol_hash`).
- Миграция = код: ревью, обратимость по возможности, заметка в `docs/database/`.

## 10. Правила создания API

- Версионирование: `/api/v1`. Документация — Swagger/OpenAPI.
- Валидация входа/выхода — Zod. DTO отражают контракт, не доменные сущности напрямую.
- Ошибки — единый формат; аутентификация — JWT/refresh + API-ключи; RBAC и rate limit на уровне guard'ов.
- Контракты фиксируются в [docs/api/](docs/api/).

## 11. Правила написания сервисов и модулей (NestJS)

- Каждый модуль **автономен**: минимальная связанность, максимальная расширяемость.
- Бизнес-логика — в сервисах; контроллеры тонкие. Внешние ресурсы — за абстракциями (DI).
- Никаких циклических зависимостей между модулями; общие контракты — в `packages/shared`/`core`.

## 12. Правила тестирования

Для каждого нового модуля: **Unit + Integration + E2E** (`bun:test`, Vitest-совместимый API —
ADR-0002; интеграционные против реальных сервисов — под `RUN_E2E=1`).
Тесты — часть DoD; критические пути (индексация, поиск, MCP-tools) покрываются обязательно.

## 13. Правила работы с очередями (BullMQ + Redis)

- Фактический набор: **`IndexWorker`** (очередь `brain-dock-index`: индексация → Qdrant + Postgres,
  статусы `Repository.indexStatus`) + watch-воркеры `watch.ts`/`watch-all.ts` (инкрементальный
  реиндекс по fs-событиям). Доп. воркеры (Document/Sync/Cleanup) — добавлять по мере надобности.
- Задачи идемпотентны; повторы и backoff настраиваются явно; прогресс/ошибки логируются.
- Тяжёлая работа (embedding, индексация) — через очереди, не в HTTP-обработчиках. Upload-индексация
  (`POST …/repositories/:id/index`) тоже **асинхронна** (план 057): API пишет файлы в staging-том
  (общий с воркером), ставит задачу `kind:'upload'` и отвечает `202 QUEUED`; воркер индексирует и
  удаляет staging. Бюджет — `INDEX_UPLOAD_MAX_TOTAL_BYTES`, каталог — `INDEX_STAGING_DIR`.

## 14. Правила работы с embedding

- Только локально (Ollama). Доступ — через `EmbeddingProvider` (без прямых вызовов модели из бизнес-кода).
- Batch-эмбеддинги, кэш эмбеддингов, версия модели хранится рядом с вектором (для реиндексации).
- Смена модели/размерности → отдельная коллекция/версия, без «тихой» порчи индекса.

## 15. Правила работы с MCP

- Полностью совместимый MCP-сервер: tools / resources / prompts; `instructions` сервера и
  `readOnlyHint`-аннотации на read-only tools (план 053).
- Реализованные tools (hosted HTTP — 28, локальный stdio — 36): `list_projects`, `search_code`,
  `generate_context`, `search_everywhere`, `repo_map`, `find_symbol`,
  `find_controller`/`find_service`/`find_module`/`find_guard`/`find_repository` (stdio — ещё
  pipe/interceptor/resolver), `find_endpoint`, `summarize_project`, `get_architecture`,
  `find_dependencies`/`find_dependents`/`impact`, `export_graph`, `remember`/`search_memory`,
  `save_knowledge`/`search_knowledge`, `save_document`/`search_docs`,
  `get_project_profile`/`update_project_profile`, `index_status`, `trigger_reindex`
  (+ CRUD-tools в stdio). Отложено: `find_prisma_model`/`find_env`/`find_config`.
- Контракты tools документируются в [docs/mcp/](docs/mcp/).

## 16. Производительность

Batch embeddings · Incremental indexing · Parallel workers · Streaming · Hash-based updates.
Кэши: chunk / embedding / search / metadata.

## 17. Roadmap (кратко)

Полная версия — [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md). **Все фазы завершены**
(планы 000–053 Done):

- ✅ **Phase 0–7:** bootstrap → foundation → indexer → embedding/storage → context engine →
  MCP server → knowledge/memory → multi-project/REST/hardening.
- ✅ **Production readiness:** CI + e2e-CI, Dockerfiles, деплой сборкой на сервере, OTel-трейсинг.
- ✅ **Multi-Repo:** движок, БД/REST, watch, кросс-репо граф.
- ✅ **Hosted MCP:** Streamable HTTP, серверный символьный индекс, remote структурные tools,
  per-key rate limit; сквозная верификация (план 041).
- ✅ **VSCode extension** (042–045, 047–049), **upload-индексация** (046),
  **фиксы эмбеддингов** (050), **hardening/закрытие аудита** (051), **качество поиска** (052),
  **MCP UX** (053).
- ✅ **Веб-кабинет + админка** (054), **прод-дефолты VSCode** (055), **автобэкапы** (056),
  **очередь для upload-индексации** (057).
- ⬜ **Дальше:** git-подключение реп, биллинг/квоты, Redis rate-limit MCP, ротация
  refresh-токенов, pino, change-coupling — [backlog](docs/roadmap/ROADMAP.md#дальше-backlog).

## 18. Текущий статус проекта

- ✅ Репозиторий инициализирован, `.gitignore` (Node/TS) на месте.
- ✅ Зафиксированы решения: Bun-runtime + NestJS, Turborepo + Bun workspaces (ADR-0001).
- ✅ **Bootstrap (Phase 0):** созданы `Claude.md`, структура `/docs`, ROADMAP, планы 000–004.
- ✅ Архитектура подтверждена; правило Context7 + latest stable.
- ✅ **Phase 1 (Foundation) завершена:** монорепо (Turbo 2.9 + bun workspaces), Docker Compose,
  Prisma 7 (миграция `init`), NestJS на Bun (`/health`), auth-скелет (JWT/refresh/RBAC/API-keys/audit).
  Runtime smoke-gate зелёный. Версии: NestJS 11.1, Prisma 7.8, zod 4, Biome 2.4. Тесты/typecheck/lint — зелёные.
- ✅ ADR-0002 (`bun:test` вместо Vitest) — Accepted (подтверждено владельцем).
- ✅ **Phase 2 (Indexer) завершена:** `@brain-dock/indexer` на ts-morph — извлечение символов,
  NestJS-ролей, DI-связей, маршрутов, импортов, чанков; инкрементальность по хэшу; CLI.
  Проверено на `apps/api`. ts-morph 28. Тесты/typecheck/Biome — зелёные.
- ✅ **Phase 3 (Embedding & Vector Storage) завершена:** `@brain-dock/{embedding,storage,search}` —
  Ollama (`nomic-embed-text`, 768d) + deterministic провайдеры, Qdrant-стор, ingestion-pipeline,
  гибридный поиск (vector+keyword); BullMQ `IndexWorker` (риск BullMQ-на-Bun закрыт). Проверено вживую.
- ✅ **Phase 4 (Context Engine) завершена:** `ContextEngine` — intent detection, intent-aware re-ranking,
  дедуп, compression, Context Builder.
- ✅ **Phase 5 (MCP-сервер) завершена:** `apps/mcp` на `@modelcontextprotocol/sdk` v1 (stdio), tools поверх индексатора/поиска/контекста.
- ✅ **Phase 6 (Knowledge & Memory) завершена:** `@brain-dock/knowledge` (Postgres + Qdrant), 14 MCP-tools.
- ✅ **Phase 7 (Multi-Project, REST & Hardening) завершена:** `ProjectsModule` (owner-scoped) + project-scoped
  REST для памяти/знаний + глобальный rate limit (fixed-window). Проверено вживую (ownership 403, rate-limit 429).
- ✅ **Production readiness (CI & Docker):** GitHub Actions (Biome+typecheck+тесты), Dockerfiles
  для api/mcp/workers (`bun install --omit=optional`, workers `--no-addons`); образ API собран и проверен (`/health` в контейнере). `bun run ci` — единый локальный прогон.
- ✅ **OpenAPI/Swagger:** `GET /api/v1/openapi.json` (OpenAPI 3.1 из Zod) + `GET /api/v1/docs` (Swagger UI).
- ✅ **Документы:** `DocumentService` (чанкинг + эмбеддинги, Qdrant `documents`), MCP-tools
  `save_document`/`search_docs`/`list_documents` (17 MCP-tools) + REST `/projects/:id/documents`.
  Форматы: md/txt/mdx/json/yaml + **PDF** (`unpdf`) + **DOCX** (`mammoth`, base64). Проверено вживую.
- ✅ **Объединённый поиск:** `UnifiedSearchService` — `search_everywhere` + REST `/projects/:id/search`.
- ✅ **MCP resources/prompts + CRUD:** resource `brain-dock://architecture`, prompts `onboard`/`explain_symbol`;
  update/delete для memory/knowledge/documents (MCP — 23 tools — и REST PATCH/DELETE) с очисткой векторов в Qdrant. Проверено вживую.
- ✅ **Граф зависимостей:** `@brain-dock/graph` (`SymbolGraph`) — `find_dependencies`/`find_dependents`/`impact`
  (26 MCP-tools). Транзитивный blast radius.
- ✅ **Граф-обогащение Context Engine:** `generate_context` подмешивает DI-соседей (boost + `related:`)
  через `SymbolGraph.dependencies`. Проверено вживую.
- ✅ **Инкрементальный реиндекс:** `IngestionService.ingestIncremental` (переэмбеддит только изменённые,
  удаляет векторы изменённых/удалённых) + `apps/workers/src/watch.ts` (fs.watch + debounce). Проверено вживую.
- ✅ **Метрики (Prometheus):** `GET /metrics` через `MetricsService` + глобальный interceptor.
- ✅ **Redis-backed rate limit:** `RATE_LIMIT_BACKEND=redis` (Bun Redis `INCR`+`EXPIRE`) — общий лимит
  между инстансами; `memory` — per-process. Проверено вживую.
- ✅ **Multi-Repo (движок + MCP):** `repo`-alias в `ChunkPayload`, фильтр `repos[]`
  (`SearchService`/`ContextEngine`/`UnifiedSearch`, `QdrantFilter.match.any`), пер-репо индексы и
  графы в `McpContext` (env `REPOS` JSON, fallback на одиночный `PROJECT_ROOT`), MCP-tool
  `list_repos` + `repos?`/`repo?`-параметры, структурные tools агрегируют по всем репо с префиксом
  alias. Исправлена изоляция `IngestionService.deletePath` (projectId+repo+path). `bun run ci` зелёный.
  План [015](docs/plans/015-multi-repo.md).
- ✅ **Multi-Repo (БД + REST + очереди):** Prisma `Repository` (`@@unique([projectId, alias])`,
  миграция `add_repositories`); `repositoryId` (uuid) в `ChunkPayload`; REST `RepositoriesController`
  (owner-scoped CRUD + `POST …/reindex`) ставит `IndexJob` (`repo`+`repositoryId`) в BullMQ-очередь
  через порт `IndexQueue` (`@brain-dock/core`); воркер пишет оба поля в payload. BullMQ-на-Bun:
  DI-токен развязан от bullmq, скрипты API — `--no-addons`. Проверено вживую (409 на дубль alias,
  CRUD, reindex → задача в Redis). План [016](docs/plans/016-multi-repo-rest.md).
- ✅ **Мульти-репо watch:** `apps/workers/src/watch-all.ts` читает `Repository` из Postgres
  (опц. scope по `PROJECT_ID`) и поднимает по watcher'у на каждый репо; инкрементальный реиндекс
  пишет `repo`+`repositoryId`. Чистый маппинг `repositoriesToWatchTargets` покрыт тестом. Проверено
  вживую (initial → правка файла → incremental). План [017](docs/plans/017-multi-repo-watch.md).
- ✅ **`update_document`:** `DocumentService.update` (MCP `update_document` + REST `PATCH
  …/documents/:id`) — при изменении `content` ре-извлекает текст, заменяет векторы (drop по
  `documentId` → re-embed); title/source-only — без ре-эмбеддинга. Проверено вживую (PATCH title,
  PATCH content → поиск находит новый контент, 404 на отсутствующий). План [018](docs/plans/018-update-document.md).
- ✅ **Экспорт графа:** `SymbolGraph.toJSON()`/`toDot()` + MCP-tool `export_graph`
  (`format: json|dot`, опц. `repo`) — выгрузка графа зависимостей (Graphviz DOT для визуализации).
  План [019](docs/plans/019-graph-export.md).
- ✅ **Нормализация score:** `UnifiedSearchService` нормализует score каждого источника min-max
  в `[0,1]` (tie-break по `rawScore`), чтобы ни один источник не доминировал из-за своей шкалы;
  `UnifiedResult.rawScore` сохранён для отображения. План [020](docs/plans/020-score-normalization.md).
- ✅ **Repositories в OpenAPI:** схемы `CreateRepository`/`UpdateRepository` + пути
  `…/repositories` (CRUD + `/reindex`) в `openapi.json`/Swagger UI. Проверено вживую. План [021](docs/plans/021-repositories-openapi.md).
- ✅ **OpenAPI завершён:** добавлены `Update*`-схемы и item-пути `PATCH`/`DELETE` для
  memory/knowledge/documents — Swagger покрывает весь REST. План [022](docs/plans/022-crud-openapi.md).
- ✅ **Кросс-репо граф:** `SymbolGraph.merge()` объединяет пер-репо графы, склеивая ссылку на
  символ в одном репо с его определением в другом (по имени; `GraphNode.repo` помечает источник).
  `McpContext.getMergedGraph()` + `allRepos` у `find_dependencies`/`find_dependents`/`impact`/
  `export_graph` — трассировка зависимостей через границы репо. План [023](docs/plans/023-cross-repo-graph.md).
- ✅ **Горячее переподнятие watcher'ов:** `reconcileWatchTargets` (чистая реконсиляция набора по
  `repositoryId`) + опц. поллинг БД в `watch-all` (`WATCH_POLL_MS`, 0 = снимок) — добавленные/
  удалённые/изменённые репо подхватываются без перезапуска. План [024](docs/plans/024-watch-resubscribe.md).
- ✅ **Деплой сборкой на сервере:** сервисы `api`/`workers` в `docker-compose.yml` за профилем
  `app` (Dockerfile'ы + service-DNS env), `bun run deploy` = `compose --profile app up -d --build`.
  Публикация образов в registry **снята** (нужна только при multi-node/k8s). План [025](docs/plans/025-deploy-build-on-server.md).
- ✅ **OpenTelemetry-трейсинг (opt-in):** `apps/api` — `initTracing`/`selectExporter` +
  `TracingInterceptor` (span на HTTP-запрос). `OTEL_TRACES_EXPORTER` = `none` (по умолчанию,
  нулевой оверхед) | `console` | `otlp` (`OTEL_EXPORTER_OTLP_ENDPOINT`). Ручная инициализация
  (auto-instrumentation несовместима с Bun). Проверено вживую (console). План [026](docs/plans/026-otel-tracing.md).
- ✅ **e2e-CI с реальными сервисами:** job `e2e` в CI поднимает Postgres/Qdrant/Redis, применяет
  миграции и гоняет `RUN_E2E=1 bun test apps/api/src/e2e` (ingestion→search через Qdrant + memory
  roundtrip через Postgres+Qdrant; deterministic embedder). Без `RUN_E2E` тесты пропускаются.
  Проверено локально. План [027](docs/plans/027-e2e-ci.md).
- ✅ **Трейсинг workers + общий init в core:** инициализация трейсинга вынесена в
  `@brain-dock/core` (`observability/tracing.ts` — `initTracing`/`getTracer`/`selectExporter`/
  `tracingOptionsFromEnv`); api использует её через тонкий re-export. Воркер пишет span `index_job`
  (project/repo/collection/files/chunks). Проверено вживую (console на реальном job). План [028](docs/plans/028-otel-workers.md).
- ✅ **First-launch hardening:** (1) общая фабрика эмбеддера `@brain-dock/embedding` —
  воркер больше не хардкодит Ollama, чтит `EMBEDDER` (фикс рассинхрона размерностей в Qdrant),
  планы [029](docs/plans/029-embedder-factory.md); (2) `/health/ready` щупает Postgres+Qdrant+Redis
  (503 при degraded) + корневой `README.md` с quickstart/тестированием, план [030](docs/plans/030-readiness-and-readme.md).
- ✅ **Prod first-launch safety:** guard дефолтных/слабых JWT-секретов при `NODE_ENV=production`
  (`envSchema.superRefine`); авто-миграции в деплое (one-shot `migrate` в compose, `api depends_on`);
  проба Ollama в `/health/ready` при `EMBEDDER=ollama` (доступность + скачана ли модель). Проверено
  вживую. План [031](docs/plans/031-prod-first-launch-safety.md).
- ✅ **MCP `find_*` расширены:** `find_guard`/`find_pipe`/`find_interceptor`/`find_resolver`/
  `find_repository` + `find_endpoint` (маршруты контроллеров). План [032](docs/plans/032-mcp-find-tools.md).
  (`find_prisma_model`/`find_env`/`find_config` отложены — нужна новая логика извлечения.)
- ✅ **API-key аутентификация:** глобальный `AuthenticationGuard` принимает Bearer JWT **или**
  `x-api-key` (кладёт принципала с ролью владельца); `ApiKeysService.resolvePrincipal`; удалены
  старые `jwt-access.guard`/`api-key.guard`. Проверено вживую. План [033](docs/plans/033-api-key-auth.md).
- ✅ **REST e2e через HTTP:** `apps/api/src/e2e/rest.e2e.test.ts` поднимает NestJS-app и ходит по
  HTTP (readiness, 401, Bearer + `x-api-key` создание проекта). CI e2e-шаг на `bun --no-addons`.
  План [034](docs/plans/034-rest-http-e2e.md).
- ✅ **Юнит-тесты воркера:** `processIndexJob` вынесена в отдельный файл (без bullmq) и покрыта
  тестами (проброс repo/repositoryId, ошибки). План [035](docs/plans/035-worker-unit-tests.md).
- ✅ **Хостинговый удалённый MCP (Streamable HTTP):** `apps/mcp/src/http.ts` (`Bun.serve`, сервис
  `mcp` в compose на `:8080`) — auth по API-ключу (`Authorization: Bearer`, ключ = пользователь),
  проект через заголовок `X-Project` (owner-scoped), персистентные tools (search/context/memory/
  knowledge/documents) из Qdrant+Postgres. Пользователь локально ничего не запускает (модель
  vexp.dev). Структурные/граф-tools — отдельный эпик (нужен серверный индекс символов). Проверено
  вживую SDK-клиентом. План [036](docs/plans/036-remote-mcp-http.md).
- ✅ **Серверный индекс символов:** Prisma `CodeSymbol`/`CodeEdge` (+ миграция); `SymbolIndexService`
  (`@brain-dock/knowledge`) — `persist(scope, index)` (replace-by-repo) + запросы
  `findSymbols`/`endpoints`/`summary`/`graph`; воркер при index-job строит индекс один раз →
  векторы (Qdrant) + символы (Postgres). e2e persist→query вживую. План [037](docs/plans/037-server-symbol-index.md).
- ✅ **Remote структурные/граф-tools:** удалённый MCP отдаёт `find_symbol`/`find_<role>`/
  `find_endpoint`/`summarize_project`/`get_architecture`/`find_dependencies`/`find_dependents`/
  `impact`/`export_graph` из серверного индекса символов (Postgres), scoped по `X-Project`. Полный
  паритет remote↔local. Проверено вживую (worker → 73 символа в PG → MCP find_symbol/impact). План [038](docs/plans/038-remote-structural-tools.md).
- ✅ **Context-propagation api→queue→worker:** `injectTraceContext`/`runWithTraceContext` в core;
  `IndexJob.trace` едет через BullMQ; спан воркера `index_job` линкуется к трейсу запроса `reindex`
  (единый распределённый трейс). Проверено (child наследует traceId родителя). План [039](docs/plans/039-trace-propagation.md).
- ✅ **Rate limit remote MCP:** per-key fixed-window на `/mcp` (после auth, ключ = владелец),
  `429`+`Retry-After`; конфиг `MCP_RATE_LIMIT_MAX`/`_WINDOW_MS`. Проверено вживую (`200×3 → 429×3`).
  План [040](docs/plans/040-mcp-rate-limit.md).
- ✅ **Сквозная верификация (план 041):** полный hosted-путь вживую на реальной инфре — REST-auth →
  API-ключ → проект/репозиторий → индексация (воркер → символы в Postgres + векторы в Qdrant) →
  remote MCP по HTTP (все tools, auth+`X-Project`+rate-limit); все `RUN_E2E` e2e зелёные.
- ✅ **VSCode-расширение (планы 042–045, 047–049):** `apps/vscode-extension` — панель (статус
  индекса, Token Savings, период Today/7/30/90, прогресс индексации), Connect по API-ключу
  (SecretStorage), авто-проект из workspace, **Setup Agents** (Claude Code/Cursor; атомарная
  запись конфигов), нативная регистрация MCP.
- ✅ **Upload-индексация (план 046):** `POST /projects/:pid/repositories/:id/index` — файлы в теле
  запроса, индексация без серверного пути и git; бюджет `INDEX_UPLOAD_MAX_TOTAL_BYTES`;
  `INDEX_SERVER_PATHS=false` в prod закрывает реиндекс по пути. + `GET /usage` (`McpUsageDaily`).
- ✅ **Фиксы эмбеддингов (план 050):** усечение входа Ollama до контекста модели (`maxChars`,
  фикс 400 при индексации).
- ✅ **Hardening / закрытие аудита — 102 находки (план 051):** FK + ON DELETE CASCADE
  (+ `project_id` → uuid) и чистка Qdrant при удалении проекта; глобальный exception filter
  `{code,message,details?}`; пагинация `take`/`skip`; `GET /audit` (ADMIN+); `TRUST_PROXY`,
  security-заголовки, `CORS_ORIGINS`, `METRICS_TOKEN`, HS256-pin; Qdrant point id скоупирован
  `projectId:repo` (фикс кросс-тенант перезаписи), reindex чистит осиротевшие точки; MCP HTTP —
  generic-ошибки, 405/413/504, IP-лимит, per-key `ApiKey.rateLimit`, graceful shutdown, e2e по
  HTTP; compose — запиненные образы, healthchecks, 127.0.0.1-биндинги, лог-ротация, mem-лимиты,
  `USER bun`; тесты 155 → 353 pass.
- ✅ **Качество поиска (план 052):** `embedQuery` + nomic task-префиксы
  (`search_document:`/`search_query:`); суб-чанкинг крупных классов (порог 6000, breadcrumb
  `file > Class`); hybrid-коллекции Qdrant (named dense + sparse BM25 idf, server-side RRF,
  code-aware токенизатор; legacy — dense-only до реиндекса); payload-индексы; `search_everywhere`
  на RRF; eval-harness `packages/search/eval` (`bun run search:eval`) — nDCG@10 0.543→0.620,
  MRR 0.551→0.561, Recall@5 0.604→0.813, промахи 14→3.
- ✅ **MCP UX (план 053):** `instructions` на обоих транспортах; `readOnlyHint` на read-only tools;
  выбор проекта URL-путём `/mcp/{slug-or-id}` (приоритетнее `X-Project`); новые tools —
  `get_project_profile`/`update_project_profile` (`Project.profile` ≤4КБ, подмешивается в
  `generate_context`), `index_status`, `trigger_reindex` (дедуп), `repo_map` (Personalized
  PageRank); REST `GET`/`PUT /projects/:id/profile`, `GET …/repositories/:id/status`; статусы
  `Repository.indexStatus` (QUEUED/INDEXING/READY/FAILED) пишут воркер и upload-путь.
- ✅ **Веб-кабинет + админка (план 054):** SPA (Vite+React) на `brain-dock.ru` за host-nginx,
  self-service API-ключи, админка (пользователи/usage/аудит).
- ✅ **Прод-дефолты VSCode (план 055):** `serverUrl`/`mcpUrl` по умолчанию → `brain-dock.ru`.
- ✅ **Автобэкапы (план 056):** `scripts/backup.sh` (pg_dump + Qdrant snapshots, ротация) +
  `restore.sh`; `bun run backup`; docs/deployment/BACKUP.md.
- ✅ **Очередь для upload-индексации (план 057):** `202 QUEUED` + staging-том, общий с воркером;
  воркер индексирует и чистит; клиенты опрашивают статус.
- ⬜ Backlog: git-подключение реп, биллинг/квоты, Redis rate-limit MCP, ротация refresh-токенов,
  pino, change-coupling, `find_prisma_model`/`find_env`/`find_config` —
  [ROADMAP](docs/roadmap/ROADMAP.md#дальше-backlog).
