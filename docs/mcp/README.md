# MCP

MCP-сервер `apps/mcp` (`@modelcontextprotocol/sdk` v1, stdio) отдаёт поиск/контекст/структуру
проекта MCP-клиентам (Claude Code, Cursor, VSCode). Реализованы tools; resources/prompts — далее.

## Tools (Phase 5)
| Tool | Назначение | Нужен Qdrant |
|---|---|---|
| `reindex` | Проиндексировать проект и залить эмбеддинги в векторное хранилище | да |
| `search_code` | Гибридный (vector+keyword) поиск по символам | да (после `reindex`) |
| `generate_context` | Бюджет-ограниченный intent-aware контекст для запроса | да |
| `find_symbol` | Поиск символа по имени (любой kind) | нет |
| `find_controller` / `find_service` / `find_module` | Список по роли (опц. фильтр по имени) | нет |
| `summarize_project` | Статистика: файлы/символы + разбивка по ролям | нет |
| `get_architecture` | Модули, контроллеры с маршрутами, DI-рёбра | нет |
| `remember` / `search_memory` / `list_memory` | Project Memory (DECISION/FACT/NOTE/TODO) | Postgres + Qdrant |
| `save_knowledge` / `search_knowledge` | Knowledge Base (ADR/architecture/FAQ/…) | Postgres + Qdrant |
| `save_document` / `search_docs` / `list_documents` | Документы (md/txt/mdx/json/yaml): чанкинг + эмбеддинги | Postgres + Qdrant |

Memory/knowledge tools требуют `DATABASE_URL` (иначе возвращают подсказку). См. [../knowledge/](../knowledge/README.md).

Структурные tools работают по in-memory индексу (ts-morph) и не требуют внешних сервисов.

## Конфигурация (env)
`PROJECT_ROOT` (что индексировать), `PROJECT_ID`, `COLLECTION` (default `code`),
`QDRANT_URL`, `OLLAMA_URL`, `EMBEDDING_MODEL`, `EMBEDDER` (`ollama`|`deterministic`, default `deterministic`).

## Подключение из Claude Code
```json
{
  "mcpServers": {
    "brain-dock": {
      "command": "bun",
      "args": ["apps/mcp/src/index.ts"],
      "env": { "PROJECT_ROOT": "apps/api/src", "EMBEDDER": "ollama" }
    }
  }
}
```

## Проверено вживую
Реальный MCP-клиент (stdio) — `bun apps/mcp/src/client-check.ts`: `tools/list` (9 tools),
`summarize_project`, `get_architecture` (модули/маршруты/DI), `reindex` (27 файлов/32 чанка),
`search_code` (релевантная выдача). Автономный in-process тест — [`apps/mcp/src/server.test.ts`](../../apps/mcp/src/server.test.ts).

## Далее
`remember`/`save_document`/`update_document` (Project Memory/Knowledge — Phase 6); MCP resources & prompts;
аутентификация по API-ключу для удалённого транспорта; больше find_*-инструментов.
