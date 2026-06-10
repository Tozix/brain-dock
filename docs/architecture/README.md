# Architecture

Слои системы, диаграммы и потоки данных.

Ключевые потоки (см. [Claude.md](../../Claude.md) §3):
- Индексация: `Repository → Files → AST → Symbols → Chunks → Embeddings → Qdrant`
- Контекст: `Query → Intent → Hybrid Search → ReRank → Compression → Context Builder → MCP`
- Knowledge Graph: `Controller → Service → Repository → Prisma → Database` + связи документов/символов/API.

## Подсистемы
- **AST-индексатор** (Phase 2, готов): [indexer.md](indexer.md) — пакет `@brain-dock/indexer`.
- **Граф зависимостей** (`@brain-dock/graph`): `SymbolGraph` из связей индексатора —
  `dependencies`/`dependents`/`impact`/`closure`. MCP-tools `find_dependencies`/`find_dependents`/`impact`.

## Hosted-архитектура (remote MCP поверх серверного индекса)

Продуктовая модель — hosted: пользователю не нужно ничего запускать локально, MCP-клиент ходит
на наш удалённый эндпоинт по HTTP (планы [036](../plans/036-remote-mcp-http.md)–[038](../plans/038-remote-structural-tools.md), [053](../plans/053-mcp-ux.md)).

- **Серверный символьный индекс** (`CodeSymbol`/`CodeEdge` в Postgres, план
  [037](../plans/037-server-symbol-index.md)): воркер при индексации пишет символы, роли,
  маршруты и рёбра графа (injects/extends/implements/imports), scoped `projectId`+`repo`,
  replace-by-repo на каждый реиндекс. `SymbolIndexService` (`@brain-dock/knowledge`) отвечает на
  структурные запросы без доступа к файлам пользователя.
- **Remote MCP** (`apps/mcp/src/remote/`, план [038](../plans/038-remote-structural-tools.md)):
  Streamable HTTP `:8080/mcp` (или `/mcp/{slug}`), auth по API-ключу, per-key rate limit;
  `find_*`/`get_architecture`/`impact`/`export_graph` отвечают из Postgres, поиск — из Qdrant.
- **`repo_map`** (план [053](../plans/053-mcp-ux.md)): карта репозитория — Personalized PageRank
  по `CodeSymbol`/`CodeEdge` отбирает важнейшие символы под токен-бюджет (есть и в локальном
  stdio MCP).
- **Статус индексации** (план [053](../plans/053-mcp-ux.md)): жизненный цикл
  `Repository.indexStatus` QUEUED → INDEXING → READY/FAILED (+ `indexError`, `lastIndexedAt`,
  счётчики) пишется воркером и upload-путём; виден через MCP `index_status` и REST
  `GET …/repositories/:id/status`; `trigger_reindex` дедуплицирует задачи в очереди.

_Дополняется по мере роста системы._
