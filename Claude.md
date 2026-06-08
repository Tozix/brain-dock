# Claude.md — Главный документ проекта `brain-dock`

> Это **главный источник истины** проекта. Любая разработка сверяется с этим файлом.
> Он обновляется после **каждой** завершённой задачи (см. раздел «Правила работы с документацией»).
>
> Связанные файлы:
> - Технические инструкции для Claude Code: [.claude/CLAUDE.md](.claude/CLAUDE.md)
> - Дорожная карта: [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md)
> - Реестр решений (ADR): [docs/adr/README.md](docs/adr/README.md)
> - Реестр планов: [docs/plans/README.md](docs/plans/README.md)

**Статус:** Iteration 0 — подготовка проекта (документация и планы). Бизнес-логика ещё не пишется.
**Дата последнего обновления:** 2026-06-09.

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
- **Background Workers** — embedding/index/document/sync/cleanup, инкрементальная индексация.
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
`projects`, `repositories`, `code`, `functions`, `classes`, `documents`,
`architecture`, `knowledge`, `memory`, `conversations`, `symbols`.

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
Типизация · Линтер (Biome) · Тесты (Vitest) · Сборка · Архитектурные нарушения · Дублирование кода.

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
  api/         # REST API (NestJS)
  mcp/         # MCP-сервер
  workers/     # фоновые воркеры (embedding/index/document/sync/cleanup)
packages/
  sdk/         # клиентский SDK
  core/        # доменное ядро, общие абстракции
  knowledge/   # Knowledge Base
  search/      # Hybrid Search + ReRank + Compression
  embedding/   # EmbeddingProvider и реализации
  indexer/     # AST-индексатор
  graph/       # Knowledge Graph
  storage/     # Qdrant/Postgres адаптеры
  shared/      # общие утилиты, типы, Zod-схемы
prisma/        # схема и миграции
docs/          # вся документация (см. docs/README.md)
```

> Phase 1–3: `apps/{api,mcp,workers}` и `packages/{shared,core,db,indexer,embedding,storage,search}`
> (api/indexer/embedding/storage/search/workers — рабочие; mcp — заглушка). `prisma/` — схема + миграции.
> AST-индексатор — [docs/architecture/indexer.md](docs/architecture/indexer.md); RAG — [docs/rag/](docs/rag/);
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

Для каждого нового модуля: **Unit + Integration + E2E** (Vitest).
Тесты — часть DoD; критические пути (индексация, поиск, MCP-tools) покрываются обязательно.

## 13. Правила работы с очередями (BullMQ + Redis)

- Воркеры: `EmbeddingWorker`, `IndexWorker`, `DocumentWorker`, `SyncWorker`, `CleanupWorker`.
- Задачи идемпотентны; повторы и backoff настраиваются явно; прогресс/ошибки логируются.
- Тяжёлая работа (embedding, индексация) — только через очереди, не в HTTP-обработчиках.

## 14. Правила работы с embedding

- Только локально (Ollama). Доступ — через `EmbeddingProvider` (без прямых вызовов модели из бизнес-кода).
- Batch-эмбеддинги, кэш эмбеддингов, версия модели хранится рядом с вектором (для реиндексации).
- Смена модели/размерности → отдельная коллекция/версия, без «тихой» порчи индекса.

## 15. Правила работы с MCP

- Полностью совместимый MCP-сервер: tools / resources / prompts.
- Планируемые tools: `search_code`, `search_docs`, `search_everywhere`, `find_symbol`, `find_class`,
  `find_function`, `find_controller`, `find_service`, `find_module`, `find_prisma_model`, `find_endpoint`,
  `find_config`, `find_env`, `remember`, `save_document`, `update_document`, `delete_document`,
  `summarize_project`, `get_architecture`, `generate_context`.
- Контракты tools документируются в [docs/mcp/](docs/mcp/).

## 16. Производительность

Batch embeddings · Incremental indexing · Parallel workers · Streaming · Hash-based updates.
Кэши: chunk / embedding / search / metadata.

## 17. Roadmap (кратко)

Полная версия — [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md).

- **Phase 0 — Bootstrap (текущая):** документация, планы, ADR. Без кода.
- **Phase 1 — Foundation:** монорепо (Turborepo + Bun workspaces), Docker Compose, Prisma, базовый NestJS, Auth.
- **Phase 2 — Indexer:** AST-индексатор, символы, чанки, инкрементальная индексация.
- **Phase 3 — Embedding & Storage:** EmbeddingProvider (Ollama), Qdrant-коллекции, воркеры.
- **Phase 4 — Hybrid Search & Context Engine.**
- **Phase 5 — MCP Server:** tools/resources/prompts.
- **Phase 6 — Knowledge Base & Project Memory.**
- **Phase 7 — Multi-Project/Repo, Admin, API-keys, hardening.**

## 18. Текущий статус проекта

- ✅ Репозиторий инициализирован, `.gitignore` (Node/TS) на месте.
- ✅ Зафиксированы решения: Bun-runtime + NestJS, Turborepo + Bun workspaces (ADR-0001).
- ✅ **Iteration 0:** созданы `Claude.md`, структура `/docs`, ROADMAP, планы 000–004.
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
- ✅ **Phase 4 (Context Engine) завершена:** `ContextEngine` — intent detection (debug/modify/refactor/explore),
  intent-aware re-ranking, дедуп, compression, Context Builder. Проверено вживую.
- 🔄 Дальше: Phase 5 — MCP-сервер ([004](docs/plans/004-mcp-server.md)), отдаёт поиск/контекст клиентам.
