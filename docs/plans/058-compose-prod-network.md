# 058 — Прод-чистый compose: инфра без хост-портов + dev-override

**Status:** Done
**Фаза:** Production / Ops
**Дата:** 2026-06-21
**Связи:** [025](025-deploy-build-on-server.md) · [054](054-web-ui.md) (host-nginx) ·
[056](056-automated-backups.md) · [GO-LIVE-CHECKLIST](../deployment/GO-LIVE-CHECKLIST.md)

## Проблема / запрос
В prod всё в Docker. Инфра (Postgres/Qdrant/Redis/Ollama) **не должна** публиковать порты на хост —
ей достаточно внутренней Compose-сети; наружу (на `127.0.0.1`, под host-nginx) нужны только
`api`/`mcp`/`web`. Хост-порты инфры были нужны лишь для локальной разработки (app из bun на хосте).

## Решение
- **Базовый `docker-compose.yml`** — прод-чистый: у инфры **нет** `ports`; in-network DNS
  (`postgres:5432`/`qdrant:6333`/`redis:6379`/`ollama:11434`). Хост-порты только у `api` (3100),
  `mcp` (8080), `web` (3300) — на `127.0.0.1`. `workers`/`migrate`/`ollama-pull` — без портов.
- **`docker-compose.dev.yml`** (новый, НЕ авто-загружаемый) — возвращает хост-порты инфры
  (15432/16333/16334/16379/11434) для dev. Подключается явно:
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` (= `bun run infra:up`).
- **package.json**: `infra:up`/`infra:down` используют dev-override; `deploy` без изменений.
- **backup.sh**: Qdrant теперь доступен **по Docker-сети** (короткоживущий
  `docker run --network container:brain-dock-qdrant curlimages/curl`), без хост-порта; Postgres —
  через `docker exec`. Нужны только docker + coreutils.
- **Доки**: новый [SERVER-DEPLOY.md](../deployment/SERVER-DEPLOY.md) (полная пошаговая инструкция),
  правки deployment README (таблица портов: инфра — internal only), GUIDE, .env.example.

## Этапы
- [x] Убрать `ports` у postgres/qdrant/redis/ollama в базовом compose (+ комментарии).
- [x] `docker-compose.dev.yml` с хост-портами инфры; `infra:up/down` через `-f … -f …`.
- [x] `backup.sh` → Qdrant по сети контейнера (qcurl), без `QDRANT_URL` хост-порта.
- [x] SERVER-DEPLOY.md + правки README/GUIDE/.env.example.
- [x] Валидация: `docker compose --profile app config` (нет инфра-портов, есть 3100/8080/3300) и
      `-f …dev.yml config` (инфра-порты есть); `bash -n backup.sh`; `bun run ci` зелёный.

## Риски
- Dev-команды теперь требуют dev-override для доступа к инфре с хоста — учтено в `infra:up`.
- `backup.sh` тянет образ `curlimages/curl` (скачивается один раз, ~4 МБ); Postgres-бэкап от него
  не зависит.

## Definition of Done
- `docker compose --profile app up -d --build` поднимает стек, инфра **не** торчит на хост;
  nginx ходит в `api`/`mcp`/`web` на `127.0.0.1`; dev (`bun run infra:up`) по-прежнему даёт инфру на
  хост-портах; бэкап работает без хост-портов; ci зелёный.
