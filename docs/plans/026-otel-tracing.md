# 026 — OpenTelemetry-трейсинг (API)

**Status:** Done
**Фаза:** Backlog (опционально)
**Связи:** [013-metrics](013-metrics.md) · [007-production-readiness](007-production-readiness.md)

## Goal
Дать распределённый трейсинг для API поверх уже готовых Prometheus-метрик: span на каждый
HTTP-запрос, экспорт в OTLP-коллектор. **Строго opt-in**: по умолчанию выключен (нулевой
оверхед), не нагружает local-first запуск.

## Подход
Ручная инициализация `NodeTracerProvider` (без auto-instrumentation — она патчит `node:http`,
ненадёжно на Bun). Экспортёр выбирается env: `none` (по умолчанию, SDK не стартует) | `console`
(отладка/проверка) | `otlp` (`@opentelemetry/exporter-trace-otlp-http`). `TracingInterceptor`
(APP_INTERCEPTOR) оборачивает каждый запрос в span; при выключенном трейсинге `trace.getTracer`
возвращает no-op — интерсептор почти бесплатен.

## Scope
**In:**
- Пакеты `@opentelemetry/{api,sdk-trace-node,resources,semantic-conventions,exporter-trace-otlp-http}`
  (latest stable) в `apps/api`.
- `tracing.ts`: `selectExporter`/`initTracing`/`getTracer`.
- `TracingInterceptor` (span per request: method/route/status).
- env: `OTEL_TRACES_EXPORTER` (none|console|otlp), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`.
- Тесты (`selectExporter`), live-проверка через `console`-экспортёр.

**Out:**
- Трейсинг workers/MCP; auto-instrumentation; metrics/logs через OTel; context-propagation между сервисами.

## Этапы
- [x] Пакеты OTel в `apps/api`.
- [x] `tracing.ts` + env-схема + init в `main.ts`.
- [x] `TracingInterceptor` (APP_INTERCEPTOR).
- [x] Тесты + live (console) + docs (api/deployment/.env.example/Claude.md).

## Definition of Done
- По умолчанию (`none`) трейсинг выключен, поведение и оверхед не меняются.
- `OTEL_TRACES_EXPORTER=console` → span на каждый запрос виден в логах (live-проверка).
- `otlp` шлёт в `OTEL_EXPORTER_OTLP_ENDPOINT`. `bun run ci` зелёный; docs обновлены.
</content>
