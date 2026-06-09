# 028 — OpenTelemetry-трейсинг для workers (+ общий init в core)

**Status:** Done
**Фаза:** Backlog (опционально)
**Связи:** [026-otel-tracing](026-otel-tracing.md) · [011-dependency-graph](011-dependency-graph.md)

## Goal
Распространить трейсинг на воркеры (тяжёлая работа: индексация/эмбеддинг), а общую инициализацию
вынести в `@brain-dock/core`, чтобы api и workers не дублировали setup.

## Сделано
- **`@brain-dock/core`**: `observability/tracing.ts` — `selectExporter`/`initTracing`/`getTracer`/
  `tracingOptionsFromEnv` (общий OTEL_* конвеншн). OTel-пакеты добавлены в core.
- **api**: `tracing.ts` теперь тонкий re-export из core (интерсептор и тесты не тронуты);
  `main.ts` использует `tracingOptionsFromEnv('brain-dock-api')`.
- **workers**: `index.ts` инициализирует трейсинг (`brain-dock-workers`); `index-worker.ts`
  оборачивает обработку job в span `index_job` (атрибуты project/repo/collection/files/chunks,
  статус ERROR при падении).
- Тесты в core (`selectExporter`, `tracingOptionsFromEnv`). Проверено вживую: реальный index-job →
  span `index_job` с атрибутами через console-экспортёр.

## Out
- Трейсинг MCP (stdio, отдельный жизненный цикл); context-propagation между api→queue→worker.

## Definition of Done
- ✅ Воркер пишет span на каждый index-job; init трейсинга общий (core); по умолчанию выключен.
- ✅ `bun run ci` зелёный; документация обновлена.
</content>
