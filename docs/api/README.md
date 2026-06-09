# API

REST API под префиксом `/api/v1` (health — в корне). Валидация — Zod; аутентификация — JWT
(глобальный `JwtAccessGuard`); RBAC — `@Roles`; глобальный rate limit. См. [Claude.md](../../Claude.md) §10.

## OpenAPI / Swagger
- `GET /api/v1/openapi.json` — спецификация **OpenAPI 3.1**, собранная из **Zod-схем** через
  `z.toJSONSchema` (без доп. зависимостей; схемы — единый источник истины для валидации и контракта).
- `GET /api/v1/docs` — Swagger UI (загружает `swagger-ui-dist` с CDN).

## Эндпоинты

### Health & metrics
`GET /health` (liveness), `GET /health/ready` (readiness, 503 при degraded),
`GET /metrics` (Prometheus text: `http_requests_total`, `http_request_duration_seconds`,
`rate_limit_blocked_total`, `process_uptime_seconds`).

### Auth (public)
`POST /api/v1/auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` (JWT).
Первый зарегистрированный пользователь → `SUPER_ADMIN`.

### API Keys
`POST /api/v1/api-keys` (SUPER_ADMIN) · `GET /api-keys` · `DELETE /api-keys/:id` (SUPER_ADMIN).

### Projects (multi-project, owner-scoped)
`POST /api/v1/projects` · `GET /projects` · `GET /projects/:id` · `DELETE /projects/:id`.
Доступ — владелец проекта или ADMIN/SUPER_ADMIN (иначе 403/404).

### Project Repositories (multi-repo, owner-scoped)
`POST /api/v1/projects/:projectId/repositories` (`{name, alias, root, defaultBranch?}`) ·
`GET …/repositories` · `GET …/repositories/:id` · `PATCH …/repositories/:id` (name/root/defaultBranch;
alias неизменяем) · `DELETE …/repositories/:id` · `POST …/repositories/:id/reindex`.
`alias` уникален в проекте (409 на дубль). `reindex` ставит `IndexJob` (`repo`+`repositoryId`) в
BullMQ-очередь `brain-dock-index` (порт `IndexQueue` из `@brain-dock/core`), которую разбирает воркер.

### Project Memory
`POST /api/v1/projects/:projectId/memory` · `GET …/memory` · `GET …/memory/search?q=`.

### Project Knowledge
`POST /api/v1/projects/:projectId/knowledge` · `GET …/knowledge` · `GET …/knowledge/search?q=`.

### Project Documents
`POST /api/v1/projects/:projectId/documents` (md/txt/mdx/json/yaml + PDF/DOCX как base64;
извлечение текста → чанкинг → эмбеддинги) · `GET …/documents` · `GET …/documents/search?q=`.

### Unified search
`GET /api/v1/projects/:projectId/search?q=` — объединённый поиск по code + memory + knowledge +
documents, общий ранжированный список с тегом `source`.

### CRUD
`PATCH`/`DELETE /api/v1/projects/:projectId/memory/:id` · `PATCH`/`DELETE …/knowledge/:id` ·
`PATCH`/`DELETE …/documents/:id`. `PATCH …/documents/:id` при изменении `content` ре-извлекает
текст, заменяет векторы и переэмбеддит; title/source-only — без ре-эмбеддинга. Удаление чистит и
Postgres, и векторы в Qdrant; ownership-checked.

Память/знания — поверх `@brain-dock/knowledge` (Postgres + Qdrant, изоляция по `projectId`); см.
[../knowledge/](../knowledge/README.md).

## Hardening
- **Rate limit:** глобальный fixed-window, ключ = userId или IP. Конфиг: `RATE_LIMIT_MAX` (300),
  `RATE_LIMIT_WINDOW_MS` (60000), `RATE_LIMIT_BACKEND` = `memory` (per-process) | `redis`
  (общий между инстансами, Bun Redis `INCR`+`EXPIRE`). Превышение → `429` + счётчик `rate_limit_blocked_total`.
- **Audit:** действия (`project.create`/`delete`, `repository.create`/`update`/`delete`/`reindex`,
  `apikey.*`, `user.*`) пишутся в `audit_logs`.

## Воспроизведение
`PORT=3100 bash scripts/smoke-rest.sh` — register → project → memory → search (проверено вживую).

## Далее
Multi-repo индексация, метрики/нагрузочное тестирование, Redis-backed rate limit, update/delete для
knowledge/memory, Swagger/OpenAPI-спецификация, документы (md/pdf/docx).
