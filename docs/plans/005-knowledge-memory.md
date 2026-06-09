# 005 — Knowledge Base & Project Memory

- **Status:** Done (memory + knowledge через MCP; документы/REST — далее)
- **Phase:** 6
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [004-mcp-server](004-mcp-server.md) · [Claude.md](../../Claude.md)

## Goal
Долговременная память проекта и база знаний: хранение фактов/решений/заметок/TODO и
бизнес-правил/архитектуры/требований/ADR/FAQ — с семантическим поиском и доступом через MCP.

## Scope
**In:**
- Prisma-модели `MemoryItem` (DECISION/FACT/NOTE/TODO) и `KnowledgeItem`
  (BUSINESS_RULE/ARCHITECTURE/REQUIREMENT/ADR/FAQ/RESEARCH/NOTE) + миграция. Изоляция по `projectId`.
- Пакет `@brain-dock/knowledge`: `MemoryService`, `KnowledgeService` поверх Postgres (source of truth)
  + Qdrant-коллекции `memory`/`knowledge` (семантический поиск через `EmbeddingProvider`).
- MCP-tools: `remember`, `search_memory`, `list_memory`, `save_knowledge`, `search_knowledge`.

**Out (далее):** документы (md/pdf/docx-инжест), REST API для knowledge/memory, update/delete-tools,
MCP resources/prompts, multi-project admin (Phase 7).

## Этапы
- [x] Prisma-модели `MemoryItem`/`KnowledgeItem` + миграция `_knowledge_memory`.
- [x] `@brain-dock/knowledge`: EmbeddedIndex (embed→Qdrant), MemoryService, KnowledgeService, zod-схемы.
- [x] MCP: Prisma в McpContext (gated на DATABASE_URL) + 5 tools (remember/search_memory/list_memory/save_knowledge/search_knowledge).
- [x] Юнит-тесты (zod-схемы) + live client-check (remember→search_memory, save_knowledge→search_knowledge).
- [x] Документация docs/knowledge, docs/database; ROADMAP, Claude.md.

## Definition of Done — ✅ выполнено
- `remember`/`search_memory` и `save_knowledge`/`search_knowledge` работают вживую через MCP
  (Postgres + Qdrant), изоляция по `projectId` (проверено).
- Тесты/typecheck/Biome зелёные; документация обновлена.

## Отложено
- Документы (md/pdf/docx-инжест), update/delete-tools, REST API для knowledge/memory,
  MCP resources/prompts, объединённый поиск (code+knowledge+memory) в Context Engine.
