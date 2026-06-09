# 022 — PATCH/DELETE memory/knowledge/documents в OpenAPI

**Status:** Done
**Фаза:** Backlog
**Связи:** [010-mcp-resources-crud](010-mcp-resources-crud.md) · [021-repositories-openapi](021-repositories-openapi.md)

## Goal
Завершить OpenAPI-контракт: CRUD-эндпоинты `PATCH`/`DELETE` для memory/knowledge/documents
существуют в REST, но не отражены в `openapi.json`/Swagger UI.

## Scope
**In:**
- Схемы `UpdateMemory`/`UpdateKnowledge`/`UpdateDocument` (из Zod) в `components.schemas`.
- Item-пути `…/memory/{id}`, `…/knowledge/{id}`, `…/documents/{id}` с `PATCH` и `DELETE`.
- Тест в `openapi.test`.

**Out:** изменения REST-поведения (только документирование существующего).

## Этапы
- [x] Схемы + item-пути в `buildOpenApiDocument`.
- [x] Тест `openapi.test`.
- [x] Docs (Claude.md) + CI + commit/push.

## Definition of Done
- `openapi.json` содержит Update-схемы и item-пути с PATCH/DELETE.
- `bun run ci` зелёный; документация обновлена.
</content>
