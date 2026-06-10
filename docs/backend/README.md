# Backend

Модули NestJS, сервисы, репозитории, воркеры и очереди (BullMQ + Redis).
Соглашения и правила — [Claude.md](../../Claude.md) §11, §13.
Особенности запуска на Bun — [bun-nestjs-notes.md](bun-nestjs-notes.md).

## apps/api — модули

| Модуль | Назначение |
|---|---|
| `ConfigModule` (global) | Валидация окружения через Zod (`ConfigService`, fail-fast при старте) |
| `PrismaModule` (global) | `PrismaService` — клиент Prisma 7 на pg-адаптере (ленивое подключение) |
| `AuditModule` (global) | `AuditService` — append-only журнал + `GET /audit` (ADMIN+) |
| `AuthModule` | Регистрация/логин/refresh; глобальная цепочка guard'ов `AuthenticationGuard` → `RolesGuard` |
| `ApiKeysModule` | Выпуск (Super Admin), список, отзыв ключей; `resolvePrincipal` для `x-api-key` |
| `ProjectsModule` | Проекты (owner-scoped CRUD) + профиль проекта (`GET`/`PUT /projects/:id/profile`) |
| `RepositoriesModule` | Репозитории проекта (CRUD, `/status`, `/reindex` → BullMQ `IndexQueue`) |
| `IndexingModule` | Upload-индексация: `POST /projects/:pid/repositories/:id/index` (файлы в теле запроса) |
| `UsageModule` | `GET /usage` — дневная статистика MCP (`McpUsageDaily`) |
| `KnowledgeApiModule` | Project-scoped REST: memory / knowledge / documents / unified search |
| `DocsModule` | `GET /api/v1/openapi.json` (OpenAPI 3.1 из Zod) + Swagger UI `/api/v1/docs` |
| `HealthModule` | `/health` (liveness), `/health/ready` (readiness: Postgres/Qdrant/Redis/Ollama) |
| `MetricsModule` | Prometheus `/metrics` (опц. за `METRICS_TOKEN`) |

Глобальные провайдеры в `AppModule`: `RateLimitGuard` (`APP_GUARD`, memory|redis backend),
`TracingInterceptor` (`APP_INTERCEPTOR`, OpenTelemetry opt-in — `src/tracing/`),
`HttpExceptionFilter` (`APP_FILTER`) — **единый конверт ошибок `{code, message, details?}`**.
Поддерживающий код: `common/` (декораторы, `ZodValidationPipe`, пагинация `take`/`skip`,
rate-limit), `e2e/` (интеграционные тесты под `RUN_E2E`).

## HTTP-эндпоинты

REST под префиксом `/api/v1`; health — в корне (исключён из префикса). Полный актуальный список —
**Swagger UI: `GET /api/v1/docs`** (спецификация: `GET /api/v1/openapi.json`). Ключевые группы:

- `auth` (register/login/refresh/me), `api-keys`, `audit` (ADMIN+), `usage`;
- `projects` (CRUD + `/profile`), `projects/:pid/repositories` (CRUD + `/status` + `/reindex` +
  upload-индексация `/index`);
- `projects/:pid/{memory,knowledge,documents}` (CRUD + `/search`), unified `projects/:pid/search`;
- `health`, `health/ready`, `metrics`.

Детали контрактов — [../api/](../api/README.md).

## Auth-модель
- Глобальная цепочка: `AuthenticationGuard` (Bearer JWT **или** `x-api-key: bd_…`; кладёт
  принципала в `request.user`) → `RolesGuard` (`@Roles(...)`).
- JWT access + refresh (раздельные секреты/TTL), `@nestjs/jwt`; алгоритм запинен на **HS256**.
- RBAC: иерархия ролей `USER < ADMIN < SUPER_ADMIN` (`@brain-dock/shared`).
- `@Public()` снимает аутентификацию с маршрута; `@CurrentUser()` отдаёт принципала.
- Пароли — `Bun.password` (argon2id); API-ключи — sha256, секрет показывается один раз;
  ключ наследует роль владельца (проверяются статус/срок/активность пользователя).

## Воркеры (apps/workers)
- `index.ts` → `index-worker.ts`/`process-index-job.ts` — BullMQ-воркер очереди `brain-dock-index`:
  индексация репозитория → векторы (Qdrant) + символы/граф (Postgres), статусы
  `Repository.indexStatus` (QUEUED/INDEXING/READY/FAILED); graceful shutdown.
- `watch.ts` — инкрементальный watch-реиндекс одного `PROJECT_ROOT`.
- `watch-all.ts` — watcher на каждый `Repository` из БД (опц. поллинг `WATCH_POLL_MS`).
