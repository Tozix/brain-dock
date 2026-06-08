# 004 — MCP-сервер (tools / resources / prompts)

- **Status:** Draft
- **Phase:** 5
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [003-rag-engine](003-rag-engine.md) · [Claude.md](../../Claude.md) §15

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
- [ ] Каркас `apps/mcp`, транспорт, аутентификация по API-ключу.
- [ ] Реализовать tools поиска поверх Hybrid Search (план 003).
- [ ] Tools памяти/документов (`remember`, `*_document`) поверх Knowledge/Memory.
- [ ] `summarize_project` / `get_architecture` / `generate_context`.
- [ ] Resources & prompts; контракты и примеры в docs/mcp, docs/examples.
- [ ] Тесты: контрактные на каждый tool, e2e через MCP-клиент.
- [ ] Обновить ROADMAP, Claude.md.

## Риски
- Совместимость MCP-клиентов. → Тестировать на реальном клиенте (Claude Code) рано.
- Изоляция данных между проектами. → Обязательная фильтрация по `project_id` на уровне tool.

## Definition of Done
- MCP-сервер подключается к Claude Code; tools поиска/контекста работают на тестовом проекте.
- Все tools документированы с контрактами и примерами; тесты зелёные.
