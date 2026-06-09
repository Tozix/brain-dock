# 039 — Context-propagation api→queue→worker

**Status:** Done
**Фаза:** Observability
**Связи:** [026-otel-tracing](026-otel-tracing.md) · [028-otel-workers](028-otel-workers.md) · [016-multi-repo-rest](016-multi-repo-rest.md)

## Goal
Связать трейс HTTP-запроса `reindex` (API) со спаном `index_job` (воркер) в единый распределённый
трейс через очередь BullMQ.

## Сделано
- `@brain-dock/core`: `injectTraceContext()` (захват активного контекста в W3C-carrier) и
  `runWithTraceContext(carrier, fn)` (выполнение в извлечённом контексте). No-op при выключенном
  трейсинге.
- `IndexJob.trace?` — carrier едет в job. `BullIndexQueue.enqueue` проставляет его из активного
  контекста (спан запроса reindex).
- Воркер: `processIndexJob` запускает `index_job` внутри `runWithTraceContext(data.trace, …)` →
  спан становится потомком спана запроса.

## Проверено
Детерминированно: carrier с `traceparent` → дочерний `index_job` наследует `traceId` родителя
(совпадение проверено). Unit-тест helpers (no-op путь). `bun run ci` зелёный.

## Definition of Done
- ✅ Спан воркера линкуется к трейсу API-запроса через очередь; при выключенном трейсинге — без оверхеда.
</content>
