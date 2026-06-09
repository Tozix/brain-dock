# 034 — REST e2e через реальный HTTP

**Status:** Done
**Фаза:** Testing
**Связи:** [027-e2e-ci](027-e2e-ci.md) · [033-api-key-auth](033-api-key-auth.md)

## Goal
Покрыть REST-стек сквозным тестом «как клиент»: поднять настоящий NestJS-app и ходить по HTTP
(раньше e2e дёргали сервисы напрямую, REST покрывался только bash-smoke без ассертов в CI).

## Сделано
- `apps/api/src/e2e/rest.e2e.test.ts` (gated `RUN_E2E`): `NestFactory.create(AppModule)` →
  `listen(0)` → fetch. Проверяет: `/health/ready` = ok; 401 без креды; register → создание
  проекта по **Bearer**; повышение до SUPER_ADMIN (Prisma) → выпуск ключа → создание проекта по
  **x-api-key**.
- CI e2e-шаг и env обновлены: `bun --no-addons test` (AppModule тянет bullmq/msgpackr — нативный
  addon падает без `--no-addons`), добавлены `JWT_*`/`OLLAMA_URL` для bootstrap конфига.
- `AppModule` импортируется **динамически в `beforeAll`** — иначе обычный `bun test` (без
  `--no-addons`) падал бы на загрузке bullmq ещё до `describe.skip`.

## Definition of Done
- ✅ REST e2e (JWT + API-ключ + projects) зелёный против реального стека (`5 pass` локально).
- ✅ Обычный `bun run ci` не грузит bullmq и не падает (e2e пропущены). CI e2e-job обновлён.
</content>
