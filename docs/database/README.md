# Database

PostgreSQL + Prisma 7. Все изменения схемы — только через миграции (правила —
[Claude.md](../../Claude.md) §9).

## Prisma 7 — особенности
- Генератор `prisma-client` (не legacy `prisma-client-js`), вывод клиента в
  `packages/db/src/generated`, `runtime = "bun"`.
- URL подключения вынесен из `schema.prisma` в [`prisma.config.ts`](../../prisma.config.ts)
  (Prisma 7 больше не принимает `url` в datasource).
- Подключение через **driver adapter** `@prisma/adapter-pg` (`createPrismaClient` в `@brain-dock/db`),
  нативные `binaryTargets` не используются.

## Команды
```bash
bun run db:generate   # сгенерировать клиент
bun run db:migrate    # создать+применить миграцию (dev)
bun run db:deploy     # применить миграции (prod)
```

## Схема
| Модель | Таблица | Назначение |
|---|---|---|
| `User` | `users` | пользователи, `passwordHash`, роль (`Role`), `isActive` |
| `Project` | `projects` | проекты пользователя (изоляция, owner); `profile` — закреплённый профиль проекта (markdown ≤4КБ, подмешивается в `generate_context`) |
| `ApiKey` | `api_keys` | API-ключи: `prefix`, `keyHash` (sha256), статус, `rateLimit` (per-key лимит MCP), сроки |
| `AuditLog` | `audit_logs` | append-only журнал действий; индекс по `created_at` |
| `MemoryItem` | `memory_items` | долговременная память проекта (DECISION/FACT/NOTE/TODO) |
| `KnowledgeItem` | `knowledge_items` | база знаний (BUSINESS_RULE/ARCHITECTURE/ADR/FAQ/…) |
| `Document` | `documents` | документы (MD/TXT/MDX/JSON/YAML/PDF/DOCX), чанкинг+эмбеддинги |
| `Repository` | `repositories` | репозитории проекта (multi-repo): `alias`, `root`, `defaultBranch`; `@@unique([projectId, alias])`; статусы индексации `indexStatus` (QUEUED/INDEXING/READY/FAILED), `indexError`, `lastIndexedAt`, `indexedFileCount`, `symbolCount` (пишут воркер и upload-путь) |
| `CodeSymbol` | `code_symbols` | серверный индекс символов (name/kind/role/file/lines/routes), scoped `projectId`+`repo` — для remote MCP |
| `CodeEdge` | `code_edges` | рёбра графа (`from`→`to`, kind: injects/extends/implements/imports), scoped `projectId`+`repo` |
| `McpUsageDaily` | `mcp_usage_daily` | дневная статистика MCP per-user (`calls`, `tokensServed`; `@@unique([userId, day])`) — питает `GET /usage` |

Enums: `Role`, `ApiKeyStatus`, `MemoryType`, `KnowledgeType`, `DocFormat`, `IndexStatus`.
Миграции: `_init`, `_knowledge_memory`, `_documents`, `_add_repositories`, `_add_code_symbols`,
`_mcp_usage_daily`, `_cascade_fks_and_audit_index`, `_project_profile_and_index_status`.
Память/знания/документы изолированы по `projectId` (uuid FK), семантический слой — Qdrant
(см. [../knowledge/](../knowledge/README.md)).

**FK-каскады (план [051](../plans/051-audit-closure.md)):** `memory_items`/`knowledge_items`/
`documents` (их `project_id` стал uuid-FK), `code_symbols`/`code_edges`, `repositories` и
`mcp_usage_daily` связаны с родителем через `ON DELETE CASCADE` — удаление проекта/пользователя
чистит всё дочернее; Qdrant-точки проекта удаляет `VectorCleanupService` (best-effort). Векторы
кода несут `repo` (alias) и `repositoryId` (uuid) для изоляции
(планы [015](../plans/015-multi-repo.md)/[016](../plans/016-multi-repo-rest.md)).

> Сгенерированный клиент (`packages/db/src/generated`) — в `.gitignore`; восстанавливается `db:generate`.
