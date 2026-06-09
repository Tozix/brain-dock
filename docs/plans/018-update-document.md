# 018 — `update_document` (CRUD-пробел документов)

**Status:** Done
**Фаза:** Backlog
**Связи:** [008-documents](008-documents.md) · [010-mcp-resources-crud](010-mcp-resources-crud.md)

## Goal
Закрыть пробел в CRUD документов: у memory/knowledge есть `update`, у документов — только
`delete`. Добавить `update_document` (MCP + REST) с корректным ре-чанкингом и ре-эмбеддингом
при изменении контента и заменой старых векторов в Qdrant.

## Scope
**In:**
- `DocumentService.update(projectId, id, patch)` — обновляет Postgres-строку; при изменении
  `content` (или `format`+`content`) ре-извлекает текст, заменяет векторы (delete по `documentId`
  → upsert новых чанков). Изменение только `title`/`source` — без ре-эмбеддинга.
- `updateDocumentSchema` в `@brain-dock/knowledge`.
- MCP-tool `update_document`; REST `PATCH /projects/:projectId/documents/:id` (owner-scoped).
- Рефактор: общий приватный `embedDocument` для `ingest`/`update` (DRY).

**Out:**
- Версионирование документов / история изменений.

## Этапы
- [x] `updateDocumentSchema` (schemas + экспорт из index).
- [x] `DocumentService.update` + рефактор `embedDocument`.
- [x] MCP `update_document`.
- [x] REST `PATCH …/documents/:id` (+ dto).
- [x] Тесты (schemas + unit `DocumentService.update`) + live REST-smoke.
- [x] Docs (mcp/api/roadmap/Claude.md).

## Риски
- Смена кол-ва чанков при update: старые точки удаляются по `documentId` целиком, затем upsert новых — нет «осиротевших» векторов.
- `format` без `content`: хранимый текст не меняется (ре-эмбеддинг только при наличии `content`) — задокументировать.

## Definition of Done
- `update_document` (MCP + REST) меняет документ; при изменении контента векторы заменяются.
- Тесты зелёные (`bun run ci`); live-проверка REST; документация обновлена.
</content>
