# 008 — Document Ingestion

- **Status:** Done (text-форматы; PDF/DOCX — далее)
- **Phase:** 8 (backlog — knowledge expansion)
- **Связи:** [005-knowledge-memory](005-knowledge-memory.md) · [Claude.md](../../Claude.md)

## Goal
Хранение и семантический поиск документов проекта: чанкинг + эмбеддинги, доступ через MCP и REST.

## Scope
**In:**
- Prisma `Document` (+ `DocFormat`) + миграция; изоляция по `projectId`.
- `@brain-dock/knowledge`: `DocumentService` (Postgres + Qdrant-коллекция `documents`),
  чанкер (по абзацам с лимитом и overlap), парсеры текстовых форматов (md/txt/mdx/json/yaml).
- MCP-tools: `save_document`, `search_docs`, `list_documents`.
- Project-scoped REST: `/projects/:projectId/documents` (+ `/search`).

**Out (далее):** PDF/DOCX-парсеры (интерфейс готов), update/delete, версии документов, OCR.

## Этапы
- [x] Prisma `Document`/`DocFormat` + миграция `_documents`.
- [x] Чанкер (`chunkText`) + текстовые парсеры (`extractText`) + `DocumentService` + zod-схемы.
- [x] MCP-tools (`save_document`/`search_docs`/`list_documents`) + REST (`/projects/:id/documents`).
- [x] Тесты (chunker/schema) + live REST (save → search → list); OpenAPI обновлён.
- [x] Документация (knowledge/api/mcp); ROADMAP, Claude.md.

## Definition of Done — ✅ выполнено
- `save_document` → `search_docs` находит документ семантически (через MCP и REST, проверено по REST),
  изоляция по `projectId`. 53 теста/typecheck/Biome/ci зелёные; документация обновлена.

## Отложено
- PDF/DOCX-парсеры (интерфейс `extractText` готов), update/delete, версии документов, OCR.
