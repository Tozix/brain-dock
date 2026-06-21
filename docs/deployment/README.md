# Deployment

Docker / Docker Compose, окружения и инфраструктура. Local-first; конфигурация —
через переменные окружения (валидируются Zod, см. [`.env.example`](../../.env.example)).

> **Боевой подъём на сервере:** пройдите [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md) по пунктам
> (секреты, DNS/TLS, RAM, дымовые проверки, бэкапы). Walkthrough — в [GUIDE.md §3](../GUIDE.md).

## Сервисы (docker-compose.yml)

Инфраструктура (всегда доступна):

| Сервис | Образ (запинен) | Host-порт → контейнер |
|---|---|---|
| postgres | `postgres:17-alpine` | `127.0.0.1:15432 → 5432` |
| qdrant | `qdrant/qdrant:v1.18.2` | `127.0.0.1:16333 → 6333`, `127.0.0.1:16334 → 6334` |
| redis | `redis:7-alpine` | `127.0.0.1:16379 → 6379` |
| ollama | `ollama/ollama:0.30.7` | `127.0.0.1:11434 → 11434` |

Приложение (за compose-профилем `app`, образы собираются на хосте):

| Сервис | Назначение |
|---|---|
| `migrate` | one-shot: `prisma migrate deploy` до старта `api`/`mcp` (`service_completed_successfully`) |
| `ollama-pull` | one-shot: скачивает `nomic-embed-text` в контейнер ollama |
| `api` | REST API на `:3100` |
| `workers` | BullMQ index-worker |
| `mcp` | удалённый MCP по **Streamable HTTP** на `:8080`, путь `/mcp` (или `/mcp/{slug}`) |
| `web` | веб-кабинет + админка (SPA) на `:3300` |

> Host-порты инфры намеренно нестандартные и **привязаны к `127.0.0.1`** (у инфра-сервисов нет
> auth). App-сервисы (`web`/`api`/`mcp`) тоже публикуются только на `127.0.0.1` — наружу смотрит
> **nginx на хост-машине**: готовый конфиг [deploy/nginx/brain-dock.ru.conf](../../deploy/nginx/brain-dock.ru.conf)
> (один домен: `/`→web, `/api/v1`→api, `/mcp`→mcp; TLS — certbot; см. GUIDE §3.3).
> URL в `.env` совпадают с этими портами.
> Креды Postgres задаются через `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` в `.env`.
> У всех сервисов: healthchecks (postgres/redis — родные пробы, qdrant — TCP, ollama — `ollama list`,
> api/mcp — `/health`) + `depends_on: service_healthy`, лог-ротация (json-file `10m × 3`),
> mem-лимиты (ollama 4g, workers 2g, api 1g). Контейнеры приложений работают от `USER bun`,
> зависимости ставятся с `--frozen-lockfile`.

## Команды
```bash
bun run infra:up      # docker compose up -d           (инфра: postgres/qdrant/redis/ollama)
bun run infra:down    # docker compose down
bun run deploy        # docker compose --profile app up -d --build  (инфра + migrate + api/workers/mcp, сборка на месте)
```

## Первый запуск
```bash
cp .env.example .env
bun install
bun run infra:up
bun run db:migrate
bun run --cwd apps/api dev    # API на http://localhost:3100
```

Модель эмбеддингов Ollama тянется отдельно (после старта контейнера):
```bash
docker exec brain-dock-ollama ollama pull nomic-embed-text
```

Проверка: `bash scripts/smoke.sh` (или `PORT=3100 bash scripts/smoke.sh`).

## CI
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) на push/PR:
- **`ci`** job: `bun install` → `bun run ci` (db:generate → Biome → turbo typecheck → bun test). Локально: `bun run ci`.
- **`e2e`** job: поднимает Postgres/Qdrant/Redis (service-контейнеры), `db:deploy`, ждёт Qdrant и
  гоняет интеграционные тесты против реальных сервисов: `RUN_E2E=1 bun --no-addons test apps/api/src/e2e`
  — ingestion→search через Qdrant, memory roundtrip (Postgres+Qdrant) и **REST через реальный HTTP**
  (NestJS app: auth по Bearer и `x-api-key`, projects). `--no-addons` нужен, т.к. AppModule тянет
  bullmq. Локально (инфра поднята): `set -a; source .env; set +a; RUN_E2E=1 bun --no-addons test apps/api/src/e2e`.
  Без `RUN_E2E` обычный `bun test` эти тесты пропускает. См. планы [027](../plans/027-e2e-ci.md)/[034](../plans/034-rest-http-e2e.md).

## Деплой: сборка на сервере (без registry)
Образы **не публикуются** в registry. Для self-hosted (один сервер, docker compose) образы
собираются **на сервере при деплое** — артефакт всегда соответствует выкаченному коду, без
секретов и реестра (см. [план 025](../plans/025-deploy-build-on-server.md)). Сервисы `api`,
`workers` и `mcp` живут за compose-профилем `app`, поэтому `infra:up` остаётся инфра-only.

```bash
git pull
cp .env.example .env          # один раз; ОБЯЗАТЕЛЬНО заполнить секреты (JWT_*) для прод
bun run deploy                # = docker compose --profile app up -d --build
```
Миграции применяет one-shot сервис `migrate` **автоматически** до старта `api`/`mcp` (`depends_on
migrate: service_completed_successfully`); запускать `db:deploy` вручную не нужно. Модель
эмбеддингов скачивает one-shot сервис `ollama-pull`.

> **Прод-секреты обязательны.** `api` стартует с `NODE_ENV=production`, и конфиг **падает при
> старте**, если `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` — дефолтные из `.env.example` или короче
> 32 символов. Сгенерировать: `openssl rand -base64 48`.
В compose `environment` перекрывает `.env` сетевыми DNS-адресами (`postgres`/`redis`/`qdrant`/
`ollama`), т.к. URL в `.env` указывают на host-порты. API публикуется на `3100:3100`,
удалённый MCP (Streamable HTTP) — на `8080:8080` (путь `/mcp` или `/mcp/{slug}`); их рекомендуется
прятать за reverse-proxy с TLS (см. [GUIDE.md §3.3](../GUIDE.md)). Stdio-режим MCP остаётся для
локальной разработки/self-host — его запускает сам MCP-клиент.

> Registry/публикация образов — только если появятся несколько нод или k8s (тогда «собрал один раз
> — `pull` на все»). Сейчас не нужно.

## Бэкапы
Автоматизация бэкапов **ещё не сделана** (пункт в [backlog](../roadmap/ROADMAP.md#дальше-backlog)).
Пока вручную: Postgres — `docker exec brain-dock-postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`;
Qdrant — snapshot API (`POST /collections/<name>/snapshots`). Векторы восстановимы реиндексацией,
поэтому критичен в первую очередь Postgres (пользователи/ключи/память/знания/символы).

### Образы вручную (опц.)
```bash
docker build -f apps/api/Dockerfile -t brain-dock-api .
docker run --rm --network host --env-file .env -e API_PORT=3300 brain-dock-api   # /health → 200
```
Образы используют `bun install --omit=optional`; workers стартуют с `--no-addons` (BullMQ-на-Bun).
Подробности — [план 007](../plans/007-production-readiness.md).

## Воркеры
- Index-worker (BullMQ): `bun --no-addons run apps/workers/src/index.ts`.
- Инкрементальный watch-реиндекс: `PROJECT_ROOT=<dir> bun apps/workers/src/watch.ts` — следит за
  `.ts/.tsx` и переэмбеддит только изменённые файлы (см. [план 012](../plans/012-incremental-watch.md)).
- Мульти-репо watch: `bun apps/workers/src/watch-all.ts` — читает `Repository` из БД, по watcher'у
  на репозиторий, переживает битый репозиторий (см. [план 017](../plans/017-multi-repo-watch.md)).
