# 035 — Юнит-тесты воркера (index job)

**Status:** Done
**Фаза:** Testing
**Связи:** [028-otel-workers](028-otel-workers.md) · [034-rest-http-e2e](034-rest-http-e2e.md)

## Goal
Покрыть логику обработки index-job юнит-тестом, не поднимая Redis/BullMQ.

## Сделано
- Вынес обработчик в чистую `processIndexJob(ingestion, data)` — отдельный файл
  `process-index-job.ts` **без импорта bullmq** (иначе тест падал бы под обычным `bun test`).
  `index-worker.ts` (создаёт BullMQ Worker) теперь просто делегирует ей.
- Тест: проброс `repo`/`repositoryId`/`collection` в ingestion + возврат отчёта; проброс ошибок.

## Definition of Done
- ✅ `processIndexJob` покрыт тестами без Redis/BullMQ; `bun run ci` зелёный (118 pass).
</content>
