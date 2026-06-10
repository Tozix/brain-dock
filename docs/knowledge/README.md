# Knowledge Base & Project Memory

Пакет `@brain-dock/knowledge` — долговременная память проекта и база знаний с семантическим
поиском. Источник истины — Postgres; семантический поиск — Qdrant. План — [../plans/005-knowledge-memory.md](../plans/005-knowledge-memory.md).

## Модель
| Сущность | Таблица | Типы |
|---|---|---|
| Project Memory | `memory_items` | DECISION / FACT / NOTE / TODO |
| Knowledge Base | `knowledge_items` | BUSINESS_RULE / ARCHITECTURE / REQUIREMENT / ADR / FAQ / RESEARCH / NOTE |

Изоляция по `projectId` (строка). Каждая запись эмбеддится и апсертится в Qdrant-коллекцию
(`memory` / `knowledge`) с point id = UUID записи (вектор и строка синхронны).

## Сервисы
- `MemoryService`: `remember`, `search`, `list`.
- `KnowledgeService`: `save`, `search`, `list`.
- `DocumentService`: `ingest`, `search`, `list` — документы (Postgres `documents` + Qdrant `documents`),
  чанкинг (`chunkText`, по абзацам с лимитом и overlap), парсеры:
  md/txt/mdx/json/yaml (текст) + **PDF** (`unpdf`) + **DOCX** (`mammoth`) — бинарные форматы передаются как **base64**.
- `EmbeddedIndex`: общий хелпер (embed → Qdrant upsert/search с фильтром по `projectId`).

## Доступ через MCP (см. [../mcp/](../mcp/README.md))
- Память: `remember`, `search_memory`, `list_memory`, `update_memory`, `delete_memory`.
- Знания: `save_knowledge`, `search_knowledge`, `update_knowledge`, `delete_knowledge`.
- Документы: `save_document`, `search_docs`, `list_documents`, `update_document`, `delete_document`.
- Объединённый поиск: `search_everywhere` (code + memory + knowledge + documents, RRF).

Требуют `DATABASE_URL` (иначе tools возвращают подсказку). Update/delete чистят и Postgres, и
векторы в Qdrant; всё доступно и по REST (`/projects/:pid/{memory,knowledge,documents}` + unified
`/projects/:pid/search`) — см. [../api/](../api/README.md). Пакет также содержит серверный
**`SymbolIndexService`** (символьный индекс для remote MCP) и `UsageService` (`mcp_usage_daily`).

## Далее
Теги-фильтры, дедуп/слияние записей, TTL/архивация памяти —
см. [backlog](../roadmap/ROADMAP.md#дальше-backlog).
