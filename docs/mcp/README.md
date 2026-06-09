# MCP

MCP-сервер `apps/mcp` (`@modelcontextprotocol/sdk` v1, stdio) отдаёт поиск/контекст/структуру
проекта MCP-клиентам (Claude Code, Cursor, VSCode). Реализованы tools; resources/prompts — далее.

## Tools (Phase 5)
| Tool | Назначение | Нужен Qdrant |
|---|---|---|
| `list_repos` | Список репозиториев проекта со статистикой (файлы/символы) | нет |
| `reindex` | Проиндексировать проект (опц. `repo` — один репозиторий) и залить эмбеддинги | да |
| `search_code` | Гибридный (vector+keyword) поиск по символам (опц. `repos[]`) | да (после `reindex`) |
| `generate_context` | Бюджет-ограниченный intent-aware контекст для запроса (опц. `repos[]`) | да |
| `find_symbol` | Поиск символа по имени (любой kind) | нет |
| `find_controller` / `find_service` / `find_module` | Список по роли (опц. фильтр по имени) | нет |
| `summarize_project` | Статистика: файлы/символы + разбивка по ролям | нет |
| `get_architecture` | Модули, контроллеры с маршрутами, DI-рёбра | нет |
| `remember` / `search_memory` / `list_memory` | Project Memory (DECISION/FACT/NOTE/TODO) | Postgres + Qdrant |
| `save_knowledge` / `search_knowledge` | Knowledge Base (ADR/architecture/FAQ/…) | Postgres + Qdrant |
| `save_document` / `search_docs` / `list_documents` | Документы (md/txt/mdx/json/yaml + PDF/DOCX как base64): чанкинг + эмбеддинги | Postgres + Qdrant |
| `search_everywhere` | Объединённый поиск: code + memory + knowledge + documents, общий ранжированный список | Qdrant (+Postgres для не-кода) |
| `update_memory` / `delete_memory` | Изменить/удалить запись памяти (с очисткой вектора) | Postgres + Qdrant |
| `update_knowledge` / `delete_knowledge` | Изменить/удалить запись знаний | Postgres + Qdrant |
| `delete_document` | Удалить документ и его чанки | Postgres + Qdrant |
| `find_dependencies` / `find_dependents` / `impact` | Граф зависимостей: прямые зависимости/зависимые и транзитивный blast radius | нет |

Memory/knowledge tools требуют `DATABASE_URL` (иначе возвращают подсказку). См. [../knowledge/](../knowledge/README.md).

## Resources & Prompts
- **Resource** `brain-dock://architecture` — модули/контроллеры/статистика проекта.
- **Prompts**: `onboard` (саммари проекта через tools), `explain_symbol` (arg `name`).

Структурные tools работают по in-memory индексу (ts-morph) и не требуют внешних сервисов.

## Конфигурация (env)
`PROJECT_ROOT` (что индексировать), `PROJECT_ID`, `COLLECTION` (default `code`),
`QDRANT_URL`, `OLLAMA_URL`, `EMBEDDING_MODEL`, `EMBEDDER` (`ollama`|`deterministic`, default `deterministic`).

### Multi-Repo
`REPOS` — JSON-массив `[{"alias":"api","root":"./apps/api"},…]`. Когда задан, проект охватывает
несколько репозиториев; `PROJECT_ROOT` используется как fallback на одиночный репо (alias `default`).
Векторы кода несут payload-поле `repo` (alias); `search_code`/`generate_context`/`search_everywhere`
принимают `repos[]` для ограничения подмножеством. Структурные tools агрегируют по всем репо и
префиксуют пути alias-ом при >1 репо. Управление репо через REST/БД — план
[016](../plans/016-multi-repo-rest.md).

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
