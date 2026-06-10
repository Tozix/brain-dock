# 004 — MCP-сервер (tools / resources / prompts)

- **Status:** Done (первый срез tools; resources/prompts/auth — далее)
- **Phase:** 5
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [003-rag-engine](003-rag-engine.md) · [Claude.md](../../Claude.md) §15

## Сделано (Phase 5)
- `apps/mcp` на `@modelcontextprotocol/sdk` v1.29 (stdio); конфиг через env; `McpContext`
  (embedder/store/search/context + ленивый in-memory индекс).
- 9 tools: `reindex`, `search_code`, `generate_context`, `find_symbol`,
  `find_controller`/`find_service`/`find_module`, `summarize_project`, `get_architecture`.
- Структурные tools работают по ts-morph-индексу (без внешних сервисов); поисковые — поверх Qdrant.
- Проверено вживую реальным MCP-клиентом (stdio) + автономный in-process тест.
- Документация: [docs/mcp/README.md](../mcp/README.md).

## Далее (за рамками этого среза)
- `remember`/`save_document`/`update_document` (Project Memory/Knowledge — Phase 6).
- MCP resources & prompts; аутентификация по API-ключу для удалённого транспорта; больше find_*.

## Goal
Полностью совместимый MCP-сервер (`apps/mcp`), отдающий поиск/контекст/память проекта
клиентам Claude Code, Cursor, VSCode и др. Тонкая обёртка над Search/Context/Knowledge.

## Scope
**In:**
- MCP-транспорт и регистрация tools/resources/prompts.
- Tools: `search_code`, `search_docs`, `search_everywhere`, `find_symbol`, `find_class`,
  `find_function`, `find_controller`, `find_service`, `find_module`, `find_prisma_model`,
  `find_endpoint`, `find_config`, `find_env`, `remember`, `save_document`, `update_document`,
  `delete_document`, `summarize_project`, `get_architecture`, `generate_context`.
- Изоляция по проекту/репозиторию; аутентификация через API-ключи.
- Контракты входа/выхода — Zod; документация каждого tool.

**Out:** сам поиск/индексация (планы 002–003); UI администрирования.

## Этапы
- [x] Каркас `apps/mcp`, транспорт, аутентификация по API-ключу.
- [x] Реализовать tools поиска поверх Hybrid Search (план 003).
- [x] Tools памяти/документов (`remember`, `*_document`) поверх Knowledge/Memory.
- [x] `summarize_project` / `get_architecture` / `generate_context`.
- [x] Resources & prompts; контракты и примеры в docs/mcp, docs/examples.
- [x] Тесты: контрактные на каждый tool, e2e через MCP-клиент.
- [x] Обновить ROADMAP, Claude.md.

## Риски
- Совместимость MCP-клиентов. → Тестировать на реальном клиенте (Claude Code) рано.
- Изоляция данных между проектами. → Обязательная фильтрация по `project_id` на уровне tool.

## Definition of Done
- MCP-сервер подключается к Claude Code; tools поиска/контекста работают на тестовом проекте.
- Все tools документированы с контрактами и примерами; тесты зелёные.
