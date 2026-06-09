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

_Дополняется по мере роста системы._
