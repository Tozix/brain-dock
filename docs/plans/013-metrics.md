# 013 — Observability: Prometheus metrics

- **Status:** Done
- **Phase:** 8 (backlog — ops)
- **Связи:** [006-multiproject-rest-hardening](006-multiproject-rest-hardening.md) · [Claude.md](../../Claude.md)

## Goal
Базовая наблюдаемость API без внешних зависимостей: HTTP-метрики в формате Prometheus.

## Сделано
- `MetricsService`: in-process счётчики + duration-summary, рендер в Prometheus text (0.0.4);
  экранирование label'ов. Метрики: `http_requests_total{method,route,status}`,
  `http_request_duration_seconds_{sum,count}`, `rate_limit_blocked_total`, `process_uptime_seconds`.
- `MetricsInterceptor` (глобальный `APP_INTERCEPTOR`): фиксирует каждый обработанный запрос (success/error).
- `MetricsController` `GET /metrics` (public, вне префикса `/api/v1`). `MetricsModule` (global).
- `RateLimitGuard` инкрементит `rate_limit_blocked_total` при 429.

## Проверено вживую
- Несколько запросов → `GET /metrics` отдаёт `http_requests_total{...}` (incl. ошибочный 400),
  duration-summary, uptime; `content-type: text/plain; version=0.0.4`.
- Unit: рендер счётчиков/summary + экранирование label'ов.

## Ограничения / далее
- Отклонения на уровне guard'ов (401/429) не проходят через interceptor (считаются отдельным счётчиком
  для rate-limit). Далее: OpenTelemetry-трейсинг (нужен коллектор), бакеты-гистограммы, метрики воркеров.
