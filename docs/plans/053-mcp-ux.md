# 053 — MCP UX: instructions, annotations, проект в URL, профиль проекта, статус индексации, repo_map

**Status:** Done
**Фаза:** Hosted MCP / Client UX
**Дата:** 2026-06-10
**Источник:** исследование аналогов (Context7, GitHub MCP, Letta memory blocks, Aider repo map,
Sourcegraph index reporting) + находки аудита (план 051).
**Связи:** [036-remote-mcp-http](036-remote-mcp-http.md) · [038-remote-structural-tools](038-remote-structural-tools.md) ·
[049-panel-period-selector](049-panel-period-selector-and-indexing-progress.md)

## Цель
Сделать hosted MCP «взрослым» продуктом: агент сам понимает, как пользоваться инструментами,
read-only вызовы не дёргают permission-промпты, статус индексации виден и управляем, один вызов
даёт осмысленную карту репозитория.

## Этапы
- [x] **Server instructions + описания + аннотации**: `McpServer` с `instructions` (протокол:
  первый вызов, требования индексации, выбор проекта); `readOnlyHint: true` на все
  search_*/find_*/get_*/list_*/summarize_*/export_graph/impact/generate_context/index_status/repo_map;
  осмысленные `destructiveHint`/`idempotentHint` на мутирующих; описания переписаны со связками.
- [x] **Проект в URL**: `/mcp/{slug-or-id}` (приоритетнее `X-Project`); NEED_PROJECT-подсказка
  упоминает оба способа.
- [x] **Профиль проекта**: тулы `get_project_profile`/`update_project_profile` (≤4096, пустая
  строка очищает); `generate_context` префиксует профиль блоком `## Project profile`;
  REST `GET/PUT /projects/:id/profile` (owner-scoped, audit, OpenAPI).
- [x] **Статус индексации**: worker пишет INDEXING→READY/FAILED (+`indexError`≤1000,
  `lastIndexedAt`, счётчики), reindex ставит QUEUED, upload-путь — синхронные переходы;
  REST `GET …/repositories/:id/status`; тулы `index_status` и `trigger_reindex` (дедуп по
  QUEUED/INDEXING; без серверной очереди честно отсылает к upload-пути).
- [x] **`repo_map`**: `buildRepoMap` (PageRank damping 0.85, 25 итераций, seedQuery-телепорт,
  бинарный поиск под токен-бюджет) в `@brain-dock/knowledge`; тулы в remote и локальном MCP;
  лимит 50000 символов с пометкой об обрезке.

## Definition of Done
- [x] Все новые тулы покрыты тестами; `bun run ci` зелёный.
- [x] GUIDE/README упоминают оба способа выбора проекта (актуализация доков — фаза документации).

## Отложено
- Реальный enqueue в hosted `trigger_reindex` требует bullmq-зависимости в `apps/mcp`
  (нативный аддон, несовместимый с Bun без `--no-addons`) — слот `RemoteServices.queue`
  опционален; без очереди тул отвечает, что серверный reindex отключён, и указывает upload-путь.
