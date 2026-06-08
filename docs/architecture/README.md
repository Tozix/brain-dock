# Architecture

Слои системы, диаграммы и потоки данных.

Ключевые потоки (см. [Claude.md](../../Claude.md) §3):
- Индексация: `Repository → Files → AST → Symbols → Chunks → Embeddings → Qdrant`
- Контекст: `Query → Intent → Hybrid Search → ReRank → Compression → Context Builder → MCP`
- Knowledge Graph: `Controller → Service → Repository → Prisma → Database` + связи документов/символов/API.

_Заполняется в Phase 2+._
