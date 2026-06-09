# 032 — Недостающие MCP `find_*`-инструменты

**Status:** Done
**Фаза:** Functional completeness
**Связи:** [004-mcp-server](004-mcp-server.md) · [002-indexer](002-indexer.md)

## Goal
Расширить покрытие `find_*`-инструментов MCP (Claude.md §15), используя роли/маршруты, которые
индексатор уже извлекает — без новой логики извлечения.

## Сделано
- Новые role-tools: `find_guard`, `find_pipe`, `find_interceptor`, `find_resolver`,
  `find_repository` (роли `NestRole` уже извлекаются индексатором).
- `find_endpoint` — список HTTP-маршрутов контроллеров (`METHOD path → Controller.handler`),
  опц. фильтр по подстроке пути; агрегация по всем репо.

## Out (требуют новой логики извлечения — отдельный план)
- `find_prisma_model` — модели в `schema.prisma` (не TS-символы; нужен парс схемы/генерёнки).
- `find_env` / `find_config` — ссылки на `process.env`/конфиг (нужен текстовый/AST-проход, не роли).

## Definition of Done
- ✅ 6 новых tools работают на in-memory индексе (мульти-репо), покрыты тестом
  (`find_guard`/`find_endpoint`). `bun run ci` зелёный (111 pass).
</content>
