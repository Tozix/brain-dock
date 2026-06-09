# 010 — MCP resources & prompts + CRUD completeness

- **Status:** Done
- **Phase:** 8 (backlog — MCP/CRUD)
- **Связи:** [004-mcp-server](004-mcp-server.md) · [005-knowledge-memory](005-knowledge-memory.md)

## Goal
Полнота MCP (tools + **resources** + **prompts**) и CRUD для памяти/знаний/документов
(update/delete с очисткой векторов в Qdrant).

## Сделано
- `QdrantStore.deletePoints` / `deleteByFilter`; `EmbeddedIndex.delete`.
- Сервисы: `MemoryService.update/delete`, `KnowledgeService.update/delete`,
  `DocumentService.delete` (удаляет чанки по `documentId`-фильтру). Изоляция по `projectId`
  (`updateMany`/`deleteMany where {id, projectId}`); re-embed при update.
- **MCP tools** (23 всего): `update_memory`/`delete_memory`, `update_knowledge`/`delete_knowledge`,
  `delete_document`.
- **MCP resources**: `brain-dock://architecture` (registerResource).
- **MCP prompts**: `onboard`, `explain_symbol` (registerPrompt).
- **REST**: `PATCH`/`DELETE` для memory/knowledge, `DELETE` для documents (ownership-checked).

## Проверено вживую
- REST CRUD-цикл (memory): create → PATCH (поиск показывает обновлённое) → DELETE (поиск пуст,
  вектор удалён) → повторный DELETE = 404.
- MCP in-process тест: `listPrompts` (onboard/explain_symbol), `listResources` + `readResource`
  (`brain-dock://architecture`).

## Далее
- update_document (re-chunk), bulk-операции, MCP resource-templates (документы как ресурсы).
