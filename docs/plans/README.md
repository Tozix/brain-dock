# Планы разработки

Любая задача сперва превращается в **план**, и только потом пишется код
(см. [Claude.md](../../Claude.md) §5 — главное правило).

## Процесс
```
Задача → Анализ → План → Сохранение в docs/plans → Этапы →
Реализация → Обновление плана → Закрытие → Обновление Claude.md
```

## Формат плана
Каждый файл — `NNN-kebab-name.md` со структурой:
**Status · Goal · Scope (in/out) · Этапы (чек-лист) · Риски · Definition of Done · Связи.**

Статусы: `Draft` → `Approved` → `In progress` → `Done` (или `On hold`).

## Реестр
| № | План | Фаза | Статус |
|---|---|---|---|
| [000](000-bootstrap.md) | Bootstrap (docs & plans) | Phase 0 | Done |
| [001](001-foundation.md) | Foundation (монорепо, инфра, auth-скелет) | Phase 1 | Done |
| [002](002-indexer.md) | AST-индексатор | Phase 2 | Done |
| [003](003-rag-engine.md) | Embedding, Vector Storage, Hybrid Search, Context | Phase 3–4 | Done |
| [004](004-mcp-server.md) | MCP-сервер (tools/resources/prompts) | Phase 5 | Done (tools) |
| [005](005-knowledge-memory.md) | Knowledge Base & Project Memory | Phase 6 | Done |
| [006](006-multiproject-rest-hardening.md) | Multi-Project, REST API, Hardening | Phase 7 | Done |
| [007](007-production-readiness.md) | Production readiness: CI & Docker | Backlog | Done |
| [008](008-documents.md) | Document Ingestion (md/txt/mdx/json/yaml + PDF/DOCX) | Backlog | Done |
| [009](009-unified-search.md) | Unified Search (search_everywhere) | Backlog | Done |
| [010](010-mcp-resources-crud.md) | MCP resources & prompts + CRUD | Backlog | Done |
| [011](011-dependency-graph.md) | Dependency Graph (@brain-dock/graph) | Backlog | Done |
| [012](012-incremental-watch.md) | Incremental watch-reindex | Backlog | Done |
| [013](013-metrics.md) | Observability: Prometheus metrics | Backlog | Done |
| [014](014-redis-rate-limit.md) | Redis-backed rate limit | Backlog | Done |
| [015](015-multi-repo.md) | Multi-Repo индексация (движок + MCP) | Backlog | Done |
| [016](016-multi-repo-rest.md) | Multi-Repo: Prisma, REST CRUD, очереди | Backlog | Done |
| [017](017-multi-repo-watch.md) | Мульти-репо watch-воркер (watch-all) | Backlog | Done |
| [018](018-update-document.md) | `update_document` (CRUD-пробел документов) | Backlog | Done |
| [019](019-graph-export.md) | Экспорт графа зависимостей (JSON/DOT) | Backlog | Done |
| [020](020-score-normalization.md) | Нормализация score в Unified Search | Backlog | Done |
| [021](021-repositories-openapi.md) | Repositories в OpenAPI | Backlog | Done |
| [022](022-crud-openapi.md) | PATCH/DELETE memory/knowledge/documents в OpenAPI | Backlog | Done |
| [023](023-cross-repo-graph.md) | Кросс-репо граф зависимостей | Backlog | Done |
