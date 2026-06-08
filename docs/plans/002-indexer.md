# 002 — AST-индексатор

- **Status:** Done
- **Phase:** 2
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [Claude.md](../../Claude.md) §3

## Решения
- **AST-движок: ts-morph** (подтверждено владельцем 2026-06-09). Высокоуровневая обёртка над
  TypeScript Compiler API: удобное извлечение классов/декораторов/методов/импортов.
  Движок спрятан за интерфейсом `AstEngine` — заменяем на SWC/oxc позже без переписывания индексатора.
- **Извлечение синтаксическое, per-file** (in-memory ts-morph Project на файл): независимое от
  кросс-файлового type checker'а → дружелюбно к инкрементальности. Глубокое разрешение типов
  между файлами — задача Phase графа.

## Первый срез (этот заход)
Извлечение символов + связей + чанков + инкрементальность по хэшу. Без БД/эмбеддингов (Phase 3).

## Goal
Превратить репозиторий в граф символов: `Repository → Files → AST → Symbols → Chunks`.
Извлекать структуру (а не «слепые» чанки) и поддерживать инкрементальную индексацию.

## Scope
**In:**
- Парсер TypeScript (AST). Извлечение символов: controllers, services, modules, providers,
  DTO, interfaces, types, enums, functions, classes, Prisma models, routes, decorators,
  imports/exports, middlewares, guards, pipes.
- Доменное представление: `Repository/File/Symbol/Chunk` (в `packages/indexer` + `packages/core`).
- Хэш-based инкрементальность; обнаружение co-changed файлов (change coupling).
- Граф связей (заготовка для `packages/graph`): `Controller → Service → Repository → Prisma`.

**Out:** эмбеддинги и запись в Qdrant (план 003); поиск (план 003); MCP (план 004).

## Этапы
- [x] AST-движок — **ts-morph** (решение выше), за интерфейсом `AstEngine`.
- [x] Модель `IndexedSymbol`/`Chunk`/`SymbolRelation`/`FileIndex`/`RepositoryIndex`; чанк = 1 символ.
- [x] Извлечение символов, NestJS-ролей, DI-связей, маршрутов, импортов (`TsMorphEngine`).
- [x] Хэширование контента; инкрементальный реиндекс (`RepositoryIndexer` + `previous`).
- [x] CLI `bun packages/indexer/src/cli.ts <dir> [--json]`.
- [x] Тесты на фикстурах (9 шт.); проверка CLI на реальном `apps/api/src`.
- [x] Документация [docs/architecture/indexer.md](../architecture/indexer.md); ROADMAP, Claude.md.

## Риски
- Разнообразие синтаксиса/конфигов TS. → Набор фикстур, постепенное расширение покрытия.
- Производительность на больших репо. → Per-file парсинг + хэш-кэш; параллелизм воркеров в Phase 3.

## Definition of Done — ✅ выполнено
- Индексатор строит символы и связи для NestJS-проекта (проверено на `apps/api`: 7 module/6 service/3 guard/3 controller/1 pipe).
- Инкрементальный прогон переиспользует неизменённые файлы (тест подтверждает).
- Тесты/typecheck/Biome зелёные; документация обновлена.

## Отложено в следующие фазы
- Запись символов/чанков в БД и эмбеддинги → Phase 3 ([003](003-rag-engine.md)).
- Полноценный кросс-файловый граф (`packages/graph`) и change-coupling по git-истории.
