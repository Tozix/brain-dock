# 001 — Foundation (монорепо, инфраструктура, auth-скелет)

- **Status:** Done
- **Phase:** 1
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [ADR-0001](../adr/0001-stack-selection.md)

> **Политика зависимостей:** перед добавлением каждой библиотеки сверяться с Context7
> (`resolve-library-id` → `query-docs`) и ставить **последнюю стабильную** версию
> (без beta/rc/canary без согласования). См. [Claude.md](../../Claude.md) §5.

## Goal
Рабочий каркас: монорепо на Turborepo + Bun workspaces, инфраструктура в Docker Compose,
Prisma с первой миграцией, bootstrap NestJS на Bun, скелет аутентификации. Без бизнес-логики поиска/индексации.

## Scope
**In:**
- Turborepo + Bun workspaces; пустые `apps/{api,mcp,workers}` и `packages/{core,shared,...}`.
- Biome, общий `tsconfig`, корневые скрипты `build/test/lint/format`.
- Docker Compose: PostgreSQL, Qdrant, Redis, Ollama (+ pull `nomic-embed-text`).
- Prisma init + миграция: `users`, `projects`, `api_keys`, `audit_log`.
- `apps/api`: NestJS bootstrap на Bun, конфиг через Zod, health-check.
- Auth-скелет: JWT + refresh, RBAC (роли вкл. Super Admin), выпуск API-ключей Super Admin'ом.

**Out:** индексатор, embedding-pipeline, поиск, MCP-tools (отдельные планы).

## Версии и находки (Context7, 2026-06-09)
- **Bun 1.3.5**, **Node 22.20** (fallback), **Docker 29 + Compose v5** — окружение готово.
- **NestJS 11** (11.1.x) — целевая мажорная версия.
- **Prisma 7** (7.6.0): новый генератор `prisma-client` (не `prisma-client-js`), требует явный `output`,
  поддерживает `runtime = "bun"` и **JS driver adapters** (нативные бинари `binaryTargets` удалены).
  → Для Postgres используем driver adapter (`@prisma/adapter-pg` + `pg`); это снижает риск Prisma-на-Bun.
- **Turborepo / Zod / Biome / BullMQ** — ставим latest stable при установке (`bun add`).

## Этапы
- [x] **Context7-сверка версий** (см. блок выше). Ключевой вывод: Prisma 7 + `runtime=bun` + pg-adapter.
- [x] **Runtime smoke-gate** (ADR-0001): NestJS boot + DI + декораторы + Prisma 7 (pg-adapter) на Bun — ✅ зелёный.
      Находки задокументированы: [docs/backend/bun-nestjs-notes.md](../backend/bun-nestjs-notes.md).
- [x] Инициализировать монорепо (Turborepo 2.9 + bun workspaces; пакеты shared/core/db, приложения api/mcp/workers).
- [x] Biome 2.4 + корневой tsconfig + turbo-пайплайны + корневые скрипты.
- [x] Docker Compose (postgres/redis/qdrant подняты; ollama описан; нестандартные host-порты).
- [x] Prisma 7 schema + `prisma.config.ts` + миграция `init` + клиент (pg-adapter).
- [x] `apps/api` bootstrap на Bun, Zod-конфиг, `/health` + `/health/ready`.
- [x] Auth-скелет (JWT/refresh, RBAC, API-keys Super Admin) + AuditService.
- [x] Тесты (`bun:test`, 9 шт.), typecheck (6 пакетов), Biome — всё зелёное; e2e через `scripts/smoke.sh`.
- [x] Обновлены docs/backend, docs/database, docs/deployment, ROADMAP, Claude.md; ADR-0002 (тест-раннер).

## Риски
- NestJS на Bun: подтверждён рабочим (smoke-gate зелёный). Зафиксированные gotcha'и и решения —
  [docs/backend/bun-nestjs-notes.md](../backend/bun-nestjs-notes.md).
- BullMQ на Bun ещё не проверен (очереди появятся в Phase 3) — проверить при интеграции воркеров.

## Definition of Done — ✅ выполнено
- `bun install` + typecheck + `bun test` + Biome — зелёные; Compose поднимает сервисы.
- Миграция применяется; `/health` отвечает; register/login/refresh/me и выпуск API-ключа работают (проверено вживую).
- Тесты проходят; документация и ROADMAP обновлены.

## Решения
- ADR-0002 (`bun:test` вместо Vitest) — **Accepted** (подтверждено владельцем 2026-06-09).
