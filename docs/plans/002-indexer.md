# 002 — AST-индексатор

- **Status:** Draft
- **Phase:** 2
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [Claude.md](../../Claude.md) §3

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
- [ ] Выбрать AST-движок (TS compiler API / ts-morph / SWC) — мини-ADR при необходимости.
- [ ] Модель `Symbol`/`Chunk` + стратегия чанкинга по символам.
- [ ] Извлечение символов и связей; обработка NestJS-декораторов.
- [ ] Хэширование файлов/символов; инкрементальный реиндекс.
- [ ] Тесты на фикстурах (типовой NestJS-проект).
- [ ] Документация docs/architecture (поток), docs/backend; обновить ROADMAP, Claude.md.

## Риски
- Разнообразие синтаксиса/конфигов TS. → Набор фикстур, постепенное расширение покрытия.
- Производительность на больших репо. → Параллелизм воркеров, хэш-кэш.

## Definition of Done
- Индексатор строит символы и связи для тестового NestJS-проекта.
- Инкрементальный прогон переиндексирует только изменённые файлы.
- Тесты зелёные; документация обновлена.
