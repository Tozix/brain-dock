# API

REST API под префиксом `/api/v1` (health — в корне). Валидация — Zod; аутентификация — глобальная
цепочка guard'ов **`AuthenticationGuard` (Bearer JWT, HS256-pin, **или** `x-api-key: bd_…`) →
`RolesGuard`** (`@Roles`, `@Public()` снимает auth); глобальный rate limit. Ошибки — единый конверт
`{code, message, details?}` (глобальный exception filter). Списки поддерживают пагинацию
`?take=&skip=`. См. [Claude.md](../../Claude.md) §10.

## OpenAPI / Swagger
- `GET /api/v1/openapi.json` — спецификация **OpenAPI 3.1**, собранная из **Zod-схем** через
  `z.toJSONSchema` (без доп. зависимостей; схемы — единый источник истины для валидации и контракта).
- `GET /api/v1/docs` — Swagger UI (загружает `swagger-ui-dist` с CDN).
- Покрыты в спецификации: auth, api-keys, audit, projects (включая `/profile`), **repositories**
  (CRUD + `/status` + `/reindex`), memory/knowledge/documents (включая `PATCH`/`DELETE`
  item-путей), unified search, health/metrics. Вне спецификации пока: `GET /usage` и
  upload-индексация `POST …/repositories/:id/index`.

## Эндпоинты

### Health & metrics
`GET /health` (liveness), `GET /health/ready` (readiness: параллельные пробы Postgres + Qdrant
`/readyz` + Redis `ping` + Ollama `/api/tags` при `EMBEDDER=ollama` — проверяет и что модель
скачана; таймаут 2s каждая; 503 при degraded),
`GET /metrics` (Prometheus text: `http_requests_total`, `http_request_duration_seconds`,
`rate_limit_blocked_total`, `process_uptime_seconds`; при заданном `METRICS_TOKEN` требует
`Authorization: Bearer <token>`).

### Auth (public)
`POST /api/v1/auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` (JWT).
Первый зарегистрированный пользователь → `SUPER_ADMIN`.

### API Keys
`POST /api/v1/api-keys` (SUPER_ADMIN) · `GET /api-keys` · `DELETE /api-keys/:id` (SUPER_ADMIN).
**Аутентификация:** любой защищённый роут принимает либо `Authorization: Bearer <jwt>`, либо
`x-api-key: bd_…`. Ключ наследует роль владельца; проверяются статус/срок/активность пользователя.

### Projects (multi-project, owner-scoped)
`POST /api/v1/projects` · `GET /projects` · `GET /projects/:id` · `DELETE /projects/:id` (каскадно
чистит и Qdrant-точки проекта) · `GET /projects/:id/profile` / `PUT /projects/:id/profile` —
профиль проекта (markdown ≤4КБ; подмешивается первым блоком в `generate_context`).
Доступ — владелец проекта или ADMIN/SUPER_ADMIN (иначе 403/404).

### Project Repositories (multi-repo, owner-scoped)
`POST /api/v1/projects/:projectId/repositories` (`{name, alias, root, defaultBranch?}`) ·
`GET …/repositories` · `GET …/repositories/:id` · `GET …/repositories/:id/status` (статус индексации:
`indexStatus` QUEUED/INDEXING/READY/FAILED, `indexError`, `lastIndexedAt`, счётчики файлов/символов) ·
`PATCH …/repositories/:id` (name/root/defaultBranch; alias неизменяем) · `DELETE …/repositories/:id` ·
`POST …/repositories/:id/reindex`.
`alias` уникален в проекте (409 на дубль). `reindex` ставит `IndexJob` (`repo`+`repositoryId`) в
BullMQ-очередь `brain-dock-index` (порт `IndexQueue` из `@brain-dock/core`), которую разбирает воркер.
Реиндекс по **серверному пути** управляется `INDEX_SERVER_PATHS` (в prod по умолчанию выключен).

### Indexing from uploads (основной hosted-путь)
`POST /api/v1/projects/:projectId/repositories/:id/index` — клиент передаёт файлы (пути + контент)
в теле запроса, сервер индексирует их напрямую (эмбеддинги → Qdrant, символы → Postgres) — код не
обязан лежать на сервере. Суммарный бюджет — `INDEX_UPLOAD_MAX_TOTAL_BYTES` (превышение → 413).
VSCode-расширение использует именно этот путь.

### Usage
`GET /api/v1/usage?days=30` — дневная статистика использования MCP текущим пользователем
(`McpUsageDaily`: calls, tokensServed по дням; питает панель Token Savings VSCode-расширения).

### Audit (ADMIN+)
`GET /api/v1/audit` — журнал действий (`audit_logs`); фильтры `actor`/`action`/`from`/`to`,
пагинация `take`/`skip`.

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
- **Rate limit:** глобальный fixed-window, ключ = userId или IP (за reverse-proxy задайте
  `TRUST_PROXY`, чтобы лимит считался по реальному клиентскому IP). Конфиг: `RATE_LIMIT_MAX` (300),
  `RATE_LIMIT_WINDOW_MS` (60000), `RATE_LIMIT_BACKEND` = `memory` (per-process) | `redis`
  (общий между инстансами, Bun Redis `INCR`+`EXPIRE`). Превышение → `429` + счётчик `rate_limit_blocked_total`.
- **HTTP:** security-заголовки на всех ответах; CORS выключен, пока не задан allowlist `CORS_ORIGINS`.
- **Контент:** лимиты размера контента (~2МБ на запись), бюджет upload-индексации
  `INDEX_UPLOAD_MAX_TOTAL_BYTES`; падение Qdrant при create откатывает строку в Postgres
  (компенсация двойной записи).
- **Audit:** действия (`project.create`/`delete`, `repository.create`/`update`/`delete`/`reindex`,
  `apikey.*`, `user.*`) пишутся в `audit_logs`.
- **Трейсинг (opt-in):** OpenTelemetry, span на каждый HTTP-запрос (`http.route`, статус).
  `OTEL_TRACES_EXPORTER` = `none` (по умолчанию, выкл) | `console` (печать) | `otlp`
  (`OTEL_EXPORTER_OTLP_ENDPOINT`, напр. `http://localhost:4318/v1/traces`). Дополняет Prometheus
  `/metrics`. Ручная инициализация (без auto-instrumentation — несовместима с Bun).

## Воспроизведение
`PORT=3100 bash scripts/smoke-rest.sh` — register → project → memory → search (проверено вживую).

## Далее
Веб-UI/биллинг поверх API, ротация refresh-токенов, очередь для upload-индексации,
структурное логирование (pino) — см. [backlog](../roadmap/ROADMAP.md#дальше-backlog).
