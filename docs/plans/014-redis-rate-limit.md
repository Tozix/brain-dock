# 014 — Redis-backed rate limit

- **Status:** Done
- **Phase:** 8 (backlog — ops)
- **Связи:** [006-multiproject-rest-hardening](006-multiproject-rest-hardening.md)

## Goal
Rate limit, общий между инстансами (multi-instance), вместо per-process in-memory.

## Сделано
- Интерфейс `RateLimiter` (async) + реализации: `InMemoryRateLimiter` (обёртка `FixedWindowLimiter`)
  и `RedisRateLimiter` (Bun `RedisClient`, `INCR` + `EXPIRE` на ключе-бакете `bd:rl:{key}:{bucket}`).
- `RateLimitGuard` стал async, инжектит `RATE_LIMITER` (токен). Бэкенд выбирается провайдером по
  env `RATE_LIMIT_BACKEND` (`memory`|`redis`).
- Использует встроенный Redis-клиент Bun — без новых зависимостей.

## Проверено вживую
- `RATE_LIMIT_BACKEND=redis`, `RATE_LIMIT_MAX=3` → после исчерпания окна `/health` отдаёт `429`;
  в Redis создаётся ключ `bd:rl:127.0.0.1:<bucket>` (счётчик общий между инстансами).
- Unit: `InMemoryRateLimiter` через async-интерфейс.

## Далее
- Sliding-window/токен-бакет; заголовки `RateLimit-*`; шардирование ключей по проекту/маршруту.
