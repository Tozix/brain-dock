# Backend

Модули NestJS, сервисы, репозитории, воркеры и очереди (BullMQ + Redis).
Соглашения и правила — [Claude.md](../../Claude.md) §11, §13.
Особенности запуска на Bun — [bun-nestjs-notes.md](bun-nestjs-notes.md).

## apps/api — текущие модули (Phase 1)

| Модуль | Назначение |
|---|---|
| `ConfigModule` (global) | Валидация окружения через Zod (`ConfigService`, fail-fast при старте) |
| `PrismaModule` (global) | `PrismaService` — клиент Prisma 7 на pg-адаптере (ленивое подключение) |
| `AuditModule` (global) | `AuditService` — append-only журнал действий |
| `AuthModule` | Регистрация/логин/refresh; глобальные guard'ы `JwtAccessGuard` → `RolesGuard` |
| `ApiKeysModule` | Выпуск (Super Admin), список, отзыв ключей; `ApiKeyGuard` (для MCP) |
| `HealthModule` | `/health` (liveness), `/health/ready` (readiness c проверкой БД) |

## HTTP-эндпоинты

REST под префиксом `/api/v1`; health — в корне (исключён из префикса).

| Метод | Путь | Доступ |
|---|---|---|
| GET | `/health` | public (liveness) |
| GET | `/health/ready` | public (readiness, 503 при degraded) |
| POST | `/api/v1/auth/register` | public (первый юзер → SUPER_ADMIN) |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/refresh` | public |
| GET | `/api/v1/auth/me` | JWT |
| POST | `/api/v1/api-keys` | SUPER_ADMIN |
| GET | `/api/v1/api-keys` | JWT (свои ключи) |
| DELETE | `/api/v1/api-keys/:id` | SUPER_ADMIN |

## Auth-модель
- JWT access + refresh (раздельные секреты/TTL), `@nestjs/jwt`.
- RBAC: иерархия ролей `USER < ADMIN < SUPER_ADMIN` (`@brain-dock/shared`), декоратор `@Roles(...)`.
- `@Public()` снимает аутентификацию с маршрута; `@CurrentUser()` отдаёт принципала.
- Пароли — `Bun.password` (argon2id); API-ключи — sha256, секрет показывается один раз.

_Расширяется в следующих фазах (indexer/search/mcp)._
