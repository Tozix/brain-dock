# 015 — Multi-Repo индексация (движок + MCP)

**Status:** Done
**Фаза:** Backlog (Multi-Project / Multi-Repository)
**Связи:** [002-indexer](002-indexer.md) · [003-rag-engine](003-rag-engine.md) · [004-mcp-server](004-mcp-server.md) · [012-incremental-watch](012-incremental-watch.md)

## Goal
Дать платформе возможность индексировать и искать сразу по **нескольким репозиториям**
в рамках одного проекта, с изоляцией и возможностью ограничить запрос подмножеством
репозиториев (`repos: ["alias"]`, как в vexp). Реализация — на уровне **ядра**
(indexer→storage→search) и **MCP-сервера**. Управление репозиториями через Prisma+REST+workers
вынесено в отдельный план [016](016-multi-repo-rest.md).

## Решения (подтверждены пользователем)
- **Охват:** движок + MCP сейчас; Prisma `Repository` + REST CRUD + BullMQ — план 016.
- **Хранение:** одна общая Qdrant-коллекция `code`, изоляция через payload-фильтр
  `projectId` (+ `repo` / `repos[]`). Cross-repo поиск — одним запросом.
- **Идентификатор репо:** строковый **alias** (человекочитаемый, как в vexp). Стабильный
  `repositoryId` (uuid) добавится вместе с Prisma в плане 016.

## Scope
**In:**
- `repo` (alias) в `ChunkPayload`; запись alias при ingest.
- Фильтр по подмножеству репо: расширение `QdrantFilter` (`match.any`), параметр `repos?: string[]`
  в `SearchService` / `ContextEngine` / `UnifiedSearchService`.
- MCP: конфиг списка репо (env `REPOS` JSON, fallback на одиночный `PROJECT_ROOT`),
  пер-репо индексы и графы в `McpContext`, новый tool `list_repos`, параметр `repos?` в
  `search_code`/`generate_context`/`search_everywhere`, опц. `repo` в `reindex` и граф-tools,
  префикс `alias/` в путях структурных tools при >1 репо.
- **Фикс бага:** `IngestionService.deletePath` фильтрует только по `path` — добавить
  `projectId` + `repo`, чтобы инкрементальный реиндекс не стирал одноимённые файлы чужих
  проектов/репозиториев.
- `IndexJob.repo?` (forward-compat для воркеров/016).

**Out (→ план 016):**
- Prisma-модель `Repository`, миграция, `repositoryId` (uuid) в payload.
- REST CRUD `/projects/:id/repositories` и запуск индексации через BullMQ per-repo.
- Мульти-репо watch-воркер (сейчас работает в рамках одного `default` репо).
- Кросс-репо граф зависимостей (символы разных репо не связываются).

## Этапы
- [x] **E1. Storage:** `QdrantFilter.match` → `{ value } | { any: [...] }` (обратносовместимо).
- [x] **E2. Search core:** `ChunkPayload.repo` + `DEFAULT_REPO`; `IngestOptions.repo`;
  `embedFile`/`ingestIndex`/`ingestIncremental` пишут alias; **фикс `deletePath`**.
- [x] **E3. Query path:** `QueryOptions.repos` (фильтр `repo any`), `BuildContextOptions.repos`,
  `UnifiedQuery.repos` — проброс до `SearchService`.
- [x] **E4. MCP context:** `RepoConfig`, `McpConfig.repos`, нормализация (fallback single-repo),
  пер-репо кэш индексов/графов, `indexes()`/`graphs()`/`multiRepo`.
- [x] **E5. MCP tools/resources:** `list_repos`; `repos?`/`repo?` параметры; структурные tools
  и `architecture`-resource агрегируют по всем репо с префиксом alias при >1.
- [x] **E6. Workers:** `IndexJob.repo?` проброшен в `ingestRepository` (без логики выбора — 016).
- [x] **E7. Тесты:** обновить `ingestion.test` (новый фильтр delete); добавить тесты на
  `repos[]`-фильтр в `SearchService`, на `list_repos` и мульти-репо `find_symbol` в MCP.
- [x] **E8. Docs:** ROADMAP, Claude.md §18, реестр планов; завести план 016.

## Риски
- **Старые векторы без `repo`:** запрос без `repos[]` их по-прежнему находит (фильтр не
  применяется); при указании `repos[]` — нет. Митигируется реиндексом (`repo='default'`).
- **Коллизии имён символов между репо в граф-tools:** при отсутствии `repo` берём первый
  репо, где символ есть, и указываем его alias. Полный кросс-репо граф — вне scope.
- **Изменение сигнатур ядра:** все новые поля **опциональны** → существующие вызовы и тесты
  остаются зелёными (проверяется `bun run ci`).

## Definition of Done
- `bun run ci` зелёный (typecheck + Biome + тесты + build).
- `SearchService` ограничивает выдачу подмножеством репо при `repos[]`; без него — поведение прежнее.
- MCP `list_repos` показывает сконфигурированные репо; `search_code`/`generate_context`/
  `search_everywhere` принимают `repos[]`; структурные tools агрегируют по всем репо.
- `deletePath` изолирован по `projectId`+`repo`+`path` (новый тест).
- Документация обновлена; план 016 заведён.
</content>
</invoke>
