# Планы разработки

Любая задача сперва превращается в **план**, и только потом пишется код
(см. [Claude.md](../../Claude.md) §5 — главное правило).

## Процесс
```
Задача → Анализ → План → Сохранение в docs/plans → Этапы →
Реализация → Обновление плана → Закрытие → Обновление Claude.md
```

## Формат плана
Каждый файл — `NNN-kebab-name.md` со структурой:
**Status · Goal · Scope (in/out) · Этапы (чек-лист) · Риски · Definition of Done · Связи.**

Статусы: `Draft` → `Approved` → `In progress` → `Done` (или `On hold`).

## Реестр
| № | План | Фаза | Статус |
|---|---|---|---|
| [000](000-bootstrap.md) | Bootstrap (docs & plans) | Phase 0 | Done |
| [001](001-foundation.md) | Foundation (монорепо, инфра, auth-скелет) | Phase 1 | Done |
| [002](002-indexer.md) | AST-индексатор | Phase 2 | Draft |
| [003](003-rag-engine.md) | Embedding, Vector Storage, Hybrid Search, Context | Phase 3–4 | Draft |
| [004](004-mcp-server.md) | MCP-сервер (tools/resources/prompts) | Phase 5 | Draft |
