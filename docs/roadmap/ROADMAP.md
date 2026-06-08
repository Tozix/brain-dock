# Roadmap — `brain-dock`

Дорожная карта платформы. Каждая фаза опирается на план(ы) в [../plans/](../plans/).
Легенда статусов: ✅ готово · 🔄 в работе · ⏭️ следующее · ⬜ запланировано.

---

## Phase 0 — Bootstrap ✅
**Цель:** подготовить проект до написания бизнес-логики.
- ✅ `.gitignore`, инициализация репозитория.
- ✅ ADR-0001: выбор стека (Bun-runtime + NestJS, Turborepo + Bun workspaces).
- ✅ Корневой `Claude.md`, структура `/docs`, ROADMAP, планы 000–004.
- ✅ Подтверждение архитектуры пользователем; правило Context7 + latest stable.
- **План:** [000-bootstrap.md](../plans/000-bootstrap.md)

## Phase 1 — Foundation ✅
**Цель:** рабочий каркас монорепо и инфраструктура разработки.
- ✅ Turborepo + Bun workspaces, `apps/{api,mcp,workers}` и `packages/{shared,core,db}`.
- ✅ Biome, корневой tsconfig, скрипты (build/test/lint/format/db/infra).
- ✅ Docker Compose: PostgreSQL, Qdrant, Redis, Ollama (нестандартные host-порты).
- ✅ Prisma 7 init + миграция (users, projects, api_keys, audit_log), pg-adapter, runtime bun.
- ✅ NestJS-bootstrap (`apps/api`) на Bun, `/health` + `/health/ready`, Zod-конфиг.
- ✅ Auth-скелет: JWT + refresh, RBAC, API-keys (Super Admin), audit — проверено вживую.
- ✅ Runtime smoke-gate зелёный (ADR-0001); находки — docs/backend/bun-nestjs-notes.md.
- **План:** [001-foundation.md](../plans/001-foundation.md) (Done)

## Phase 2 — Indexer ✅
**Цель:** превратить репозиторий в граф символов.
- ✅ AST-движок ts-morph за интерфейсом `AstEngine`; пакет `@brain-dock/indexer`.
- ✅ Repository → Files → AST → Symbols → Chunks; NestJS-роли, DI-связи, маршруты, импорты.
- ✅ Хэш-based инкрементальная индексация; CLI; тесты + проверка на `apps/api`.
- ⏭️ Отложено: запись в БД/эмбеддинги (Phase 3), полный граф/change-coupling.
- **План:** [002-indexer.md](../plans/002-indexer.md) (Done)

## Phase 3 — Embedding & Vector Storage ⬜
**Цель:** локальные эмбеддинги и векторное хранилище.
- `EmbeddingProvider` (Ollama, `nomic-embed-text`), batch + кэш + версия модели.
- Qdrant-коллекции, схемы payload, фильтрация по проекту.
- Воркеры BullMQ: Embedding/Index.
- **План:** [003-rag-engine.md](../plans/003-rag-engine.md) (часть)

## Phase 4 — Hybrid Search & Context Engine ⬜
**Цель:** качественный сбор контекста.
- Keyword + vector + AST + knowledge + metadata; re-ranking; compression.
- Intent detection → Context Builder.
- **План:** [003-rag-engine.md](../plans/003-rag-engine.md) (часть)

## Phase 5 — MCP Server ⬜
**Цель:** совместимый MCP-сервер для Claude Code/Cursor/VSCode.
- tools / resources / prompts; контракты всех tools.
- **План:** [004-mcp-server.md](../plans/004-mcp-server.md)

## Phase 6 — Knowledge Base & Project Memory ⬜
**Цель:** хранение знаний и долговременной памяти.
- Business rules, ADR, requirements, FAQ, release notes, deployment.
- Project Memory: решения, факты, заметки, TODO.

## Phase 7 — Multi-Project/Repo, Admin & Hardening ⬜
**Цель:** изоляция, администрирование, готовность к проду.
- Multi-project/multi-repo изоляция индексов и данных.
- Admin, rate limit, audit log, кэши, метрики, нагрузочное тестирование.
