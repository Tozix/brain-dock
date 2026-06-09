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
  чанкинг (`chunkText`, по абзацам с лимитом и overlap), парсеры текстовых форматов
  (md/txt/mdx/json/yaml; PDF/DOCX — далее, интерфейс `extractText` готов).
- `EmbeddedIndex`: общий хелпер (embed → Qdrant upsert/search с фильтром по `projectId`).

## Доступ через MCP (см. [../mcp/](../mcp/README.md))
`remember`, `search_memory`, `list_memory`, `save_knowledge`, `search_knowledge`.
Требуют `DATABASE_URL` (иначе tools возвращают подсказку). Проверено вживую через MCP-клиент:
`remember` → `search_memory` находит семантически; `save_knowledge` → `search_knowledge`.

## Далее
Документы (md/pdf/docx-инжест), update/delete, REST API, теги-фильтры, дедуп/слияние записей,
объединённый поиск (code + knowledge + memory) в Context Engine.
