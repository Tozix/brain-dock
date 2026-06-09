# 007 — Production readiness: CI & Docker

- **Status:** Done
- **Phase:** 8 (backlog — production hardening)
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [deployment](../deployment/README.md) · [Claude.md](../../Claude.md)

## Goal
Сделать проект разворачиваемым и проверяемым в CI: автоматический контроль качества и
контейнеризация приложений.

## Сделано
- **CI** — [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml): на push в `main` и PR
  выполняет `bun install` → `bun run ci` (db:generate → Biome → turbo typecheck → bun test).
  Root-скрипт `ci` и `test = bun test` (единый прогон находит все тесты монорепо).
- **Dockerfiles** для `apps/{api,mcp,workers}` (база `oven/bun:1.3.5`, сборка из корня).
  `bun install --omit=optional` — пропускает нативные optional-пакеты (в т.ч. `msgpackr-extract`,
  который не нужен и не компилируется в slim-образе без gcc); рантайму они не требуются.
  Workers стартуют с `--no-addons` (BullMQ-на-Bun, см. [bun-nestjs-notes](../backend/bun-nestjs-notes.md)).
- `.dockerignore`; пакеты без тестов получили no-op `test`-скрипт (чтобы `turbo run test` не падал).

## Проверено вживую
- `bun run ci` локально — зелёный (db:generate, Biome, typecheck 11, 44 теста).
- `docker build -f apps/api/Dockerfile .` — образ собирается; контейнер (`--network host`) поднимает
  API, `/health` → 200, `/health/ready` → 200 (`db.up: true`).

## Решения / находки
- `postinstall`-удаление `msgpackr-extract` **отменено** — оно ломало чистый `bun install`
  (`exit 1`) и, значит, CI/Docker. Замена: `--no-addons` для рантайма BullMQ + `--omit=optional` для образов.
- CI использует **обычный** `bun install` (нужны платформенные бинарники Biome/Turbo); на GitHub
  `ubuntu-latest` нативные пакеты ставятся из prebuild или компилируются (есть gcc).

## Далее
Публикация образов (registry), Swagger/OpenAPI, метрики/трейсинг, healthcheck в compose,
multi-stage prod-образы (slim), e2e в CI с поднятием сервисов.
