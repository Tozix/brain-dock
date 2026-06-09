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

## Схема (Phase 1)
| Модель | Таблица | Назначение |
|---|---|---|
| `User` | `users` | пользователи, `passwordHash`, роль (`Role`), `isActive` |
| `Project` | `projects` | проекты пользователя (изоляция, owner) |
| `ApiKey` | `api_keys` | API-ключи: `prefix`, `keyHash` (sha256), статус, лимиты, сроки |
| `AuditLog` | `audit_logs` | append-only журнал действий |
| `MemoryItem` | `memory_items` | долговременная память проекта (DECISION/FACT/NOTE/TODO) |
| `KnowledgeItem` | `knowledge_items` | база знаний (BUSINESS_RULE/ARCHITECTURE/ADR/FAQ/…) |
| `Document` | `documents` | документы (MD/TXT/MDX/JSON/YAML/PDF/DOCX), чанкинг+эмбеддинги |
| `Repository` | `repositories` | репозитории проекта (multi-repo): `alias`, `root`, `defaultBranch`; `@@unique([projectId, alias])` |

Enums: `Role`, `ApiKeyStatus`, `MemoryType`, `KnowledgeType`, `DocFormat`.
Миграции: `_init`, `_knowledge_memory`, `_documents`, `_add_repositories`. Память/знания/документы
изолированы по `projectId` (строка), семантический слой — Qdrant (см. [../knowledge/](../knowledge/README.md)).
`Repository` связан с `Project` (`onDelete: Cascade`); векторы кода несут `repo` (alias) и
`repositoryId` (uuid) для изоляции (планы [015](../plans/015-multi-repo.md)/[016](../plans/016-multi-repo-rest.md)).

> Сгенерированный клиент (`packages/db/src/generated`) — в `.gitignore`; восстанавливается `db:generate`.
