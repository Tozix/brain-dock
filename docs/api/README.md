# API

REST API под префиксом `/api/v1` (health — в корне). Валидация — Zod; аутентификация — JWT
(глобальный `JwtAccessGuard`); RBAC — `@Roles`; глобальный rate limit. См. [Claude.md](../../Claude.md) §10.

## OpenAPI / Swagger
- `GET /api/v1/openapi.json` — спецификация **OpenAPI 3.1**, собранная из **Zod-схем** через
  `z.toJSONSchema` (без доп. зависимостей; схемы — единый источник истины для валидации и контракта).
- `GET /api/v1/docs` — Swagger UI (загружает `swagger-ui-dist` с CDN).

## Эндпоинты

### Health
`GET /health` (liveness), `GET /health/ready` (readiness, 503 при degraded).

### Auth (public)
`POST /api/v1/auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` (JWT).
Первый зарегистрированный пользователь → `SUPER_ADMIN`.

### API Keys
`POST /api/v1/api-keys` (SUPER_ADMIN) · `GET /api-keys` · `DELETE /api-keys/:id` (SUPER_ADMIN).

### Projects (multi-project, owner-scoped)
`POST /api/v1/projects` · `GET /projects` · `GET /projects/:id` · `DELETE /projects/:id`.
Доступ — владелец проекта или ADMIN/SUPER_ADMIN (иначе 403/404).

### Project Memory
`POST /api/v1/projects/:projectId/memory` · `GET …/memory` · `GET …/memory/search?q=`.

### Project Knowledge
`POST /api/v1/projects/:projectId/knowledge` · `GET …/knowledge` · `GET …/knowledge/search?q=`.

### Project Documents
`POST /api/v1/projects/:projectId/documents` (md/txt/mdx/json/yaml + PDF/DOCX как base64;
извлечение текста → чанкинг → эмбеддинги) · `GET …/documents` · `GET …/documents/search?q=`.

Память/знания — поверх `@brain-dock/knowledge` (Postgres + Qdrant, изоляция по `projectId`); см.
[../knowledge/](../knowledge/README.md).

## Hardening
- **Rate limit:** глобальный fixed-window (`FixedWindowLimiter`), ключ = userId или IP.
  Конфиг: `RATE_LIMIT_MAX` (default 300), `RATE_LIMIT_WINDOW_MS` (default 60000). Превышение → `429`.
  Для нескольких инстансов нужен Redis-backed лимитер (далее).
- **Audit:** действия (`project.create`/`delete`, `apikey.*`, `user.*`) пишутся в `audit_logs`.

## Воспроизведение
`PORT=3100 bash scripts/smoke-rest.sh` — register → project → memory → search (проверено вживую).

## Далее
Multi-repo индексация, метрики/нагрузочное тестирование, Redis-backed rate limit, update/delete для
knowledge/memory, Swagger/OpenAPI-спецификация, документы (md/pdf/docx).
