# 037 — Серверный индекс символов (Postgres)

**Status:** Done
**Фаза:** Hosted product
**Связи:** [002-indexer](002-indexer.md) · [011-dependency-graph](011-dependency-graph.md) · [036-remote-mcp-http](036-remote-mcp-http.md)

## Проблема
Структурные/граф-tools строят индекс из **файловой системы** (`PROJECT_ROOT`). На хостинге файлов
пользователя нет → нужно хранить символы/рёбра на сервере, чтобы remote MCP их отдавал.

## Goal (этот план)
Персистентность символьного индекса: при индексации репо воркер сохраняет символы и DI/extends/
implements-рёбра в Postgres (scoped по `projectId`+`repo`), и есть сервис запросов поверх БД,
строящий те же структурные ответы и `SymbolGraph`. (Remote-tools поверх — план 038.)

## Scope
**In:**
- Prisma `CodeSymbol` + `CodeEdge` (+ миграция), scoped `projectId`+`repo`.
- `SymbolIndexService` (`@brain-dock/knowledge`): `persist(scope, index)` (replace-by-repo) +
  запросы `findSymbols`/`endpoints`/`summary`/`architecture`/`graph(projectId, repos?) → SymbolGraph`.
- Воркер: при index-job строит индекс один раз → векторы (как раньше) + persist символов.
- Тесты: построение графа/запросов из строк (fake prisma) + e2e persist→query (RUN_E2E).

**Out:** remote-tools (план 038); хранение чанков/импортов; кросс-репо граф из БД (склейка по имени — позже).

## Этапы
- [x] Prisma `CodeSymbol`/`CodeEdge` + миграция.
- [x] `SymbolIndexService` (persist + queries + graph).
- [x] Воркер: `processIndexJob` строит индекс один раз, пишет векторы + символы.
- [x] Тесты (fake-prisma граф + e2e persist→query) + CI + commit.

## Definition of Done
- Индексация репо воркером кладёт символы/рёбра в Postgres; `SymbolIndexService` восстанавливает
  структурные ответы и граф. `bun run ci` зелёный; e2e persist→query вживую.
</content>
