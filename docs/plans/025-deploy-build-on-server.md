# 025 — Деплой сборкой на сервере (без публикации образов)

**Status:** Done
**Фаза:** Backlog → решение владельца
**Связи:** [007-production-readiness](007-production-readiness.md)

## Решение (владелец)
Образы в registry **не публикуем**. Для текущей модели (self-hosted, один сервер, docker compose)
проще и надёжнее собирать образы **на сервере при деплое** (`docker compose up -d --build`):
артефакт всегда соответствует выкаченному коду, без registry/секретов. Registry — только если
появятся несколько нод/k8s (тогда вернуться к этому).

## Scope
**In:**
- Сервисы `api` и `workers` в `docker-compose.yml` с `build:` (Dockerfile'ы уже есть), за compose
  **profile `app`** — чтобы `infra:up` остался инфра-only.
- Service-DNS URL'ы (postgres/redis/qdrant/ollama) через `environment` (перекрывают `.env`).
- Скрипт `deploy` (`compose --profile app up -d --build`); гайд в `docs/deployment`.
- Убрать «публикацию образов» из ROADMAP/Claude.md.

**Out:**
- `mcp` в compose — stdio-сервер, запускается MCP-клиентом, не демон.
- Реальная выкладка на конкретный сервер; reverse-proxy/TLS.

## Этапы
- [x] `api`/`workers` в compose (profile `app`, depends_on, env override).
- [x] Скрипт `deploy` в `package.json`.
- [x] `docs/deployment`: раздел «Деплой сборкой на сервере» (+ миграции одноразово).
- [x] ROADMAP/Claude.md: снять «публикацию образов».
- [x] CI + commit/push.

## Definition of Done
- `docker compose --profile app up -d --build` поднимает api+workers поверх инфры; `infra:up` без изменений.
- Гайд описывает деплой и применение миграций; «публикация образов» убрана из планов.
- `bun run ci` зелёный.
</content>
