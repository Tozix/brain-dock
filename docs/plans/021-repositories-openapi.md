# 021 — Repositories в OpenAPI

**Status:** Done
**Фаза:** Backlog
**Связи:** [016-multi-repo-rest](016-multi-repo-rest.md) · [007-production-readiness](007-production-readiness.md)

## Goal
Завершить OpenAPI-контракт: REST-модуль репозиториев (план 016) сейчас не отражён в
`openapi.json`/Swagger UI. Добавить его схемы и пути.

## Scope
**In:**
- Схемы `CreateRepository`/`UpdateRepository` (из Zod-DTO) в `components.schemas`.
- Пути: коллекция (`POST`/`GET`), элемент (`GET`/`PATCH`/`DELETE`), `POST …/reindex`.
- Тест в `openapi.test` на присутствие схемы и путей.

**Out:**
- PATCH/DELETE memory/knowledge/documents в OpenAPI (отдельный пробел, вне scope).

## Этапы
- [x] Схемы + пути репозиториев в `buildOpenApiDocument`.
- [x] Тест `openapi.test`.
- [x] Docs (api/Claude.md) + CI + commit/push.

## Definition of Done
- `openapi.json` содержит `CreateRepository` и пути `…/repositories` (+ reindex).
- `bun run ci` зелёный; документация обновлена.
</content>
