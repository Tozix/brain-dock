# 030 — Полноценный readiness + корневой README

**Status:** Done
**Фаза:** First-launch hardening
**Связи:** [001-foundation](001-foundation.md) · [013-metrics](013-metrics.md)

## Goal
Подготовить проект к первому запуску: readiness-проба должна отражать **все** критичные
зависимости (не только БД), и в корне репозитория должен быть человекочитаемый README с
quickstart.

## Сделано
- **`HealthService.readiness`** теперь параллельно щупает Postgres (`SELECT 1`), Qdrant
  (`GET /readyz`) и Redis (Bun `RedisClient.ping`) с жёстким таймаутом 2s на пробу; `status` =
  `degraded` (HTTP 503), если любая из трёх недоступна. Ollama сообщается, но не гейтит (не на
  пути запроса). Проверено вживую: `{status: ok, db/qdrant/redis up}`.
- **`README.md`** в корне: что это, стек, структура, quickstart (infra→migrate→api/worker),
  подключение MCP (incl. multi-repo `REPOS`), тест/verify (`bun run ci`, `RUN_E2E`, smoke,
  `/health/ready`), деплой, observability.

## Out
- Liveness-зависимые рестарты/orchestration; проба Ollama-модели (pull-статус).

## Definition of Done
- ✅ `/health/ready` отражает db+qdrant+redis, 503 при degraded (проверено вживую).
- ✅ Корневой README с quickstart и разделом тестирования. `bun run ci` зелёный.
</content>
