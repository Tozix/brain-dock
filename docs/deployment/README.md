# Deployment

Docker / Docker Compose, окружения и инфраструктура. Local-first; конфигурация —
через переменные окружения (валидируются Zod, см. [`.env.example`](../../.env.example)).

## Сервисы (docker-compose.yml)
| Сервис | Образ | Host-порт → контейнер |
|---|---|---|
| postgres | `postgres:17-alpine` | `15432 → 5432` |
| qdrant | `qdrant/qdrant:latest` | `16333 → 6333`, `16334 → 6334` |
| redis | `redis:7-alpine` | `16379 → 6379` |
| ollama | `ollama/ollama:latest` | `11434 → 11434` |

> Host-порты намеренно нестандартные, чтобы не конфликтовать с другими локальными
> инстансами Postgres/Redis/Qdrant. URL в `.env` совпадают с этими портами.

## Команды
```bash
bun run infra:up      # docker compose up -d           (инфра: postgres/qdrant/redis/ollama)
bun run infra:down    # docker compose down
bun run deploy        # docker compose --profile app up -d --build  (инфра + api/workers, сборка на месте)
```

## Первый запуск
```bash
cp .env.example .env
bun install
bun run infra:up
bun run db:migrate
bun run --cwd apps/api dev    # API на http://localhost:3000
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
секретов и реестра (см. [план 025](../plans/025-deploy-build-on-server.md)). Сервисы `api` и
`workers` живут за compose-профилем `app`, поэтому `infra:up` остаётся инфра-only.

```bash
git pull
cp .env.example .env          # один раз; ОБЯЗАТЕЛЬНО заполнить секреты (JWT_*) для прод
bun run deploy                # = docker compose --profile app up -d --build
docker exec brain-dock-ollama ollama pull nomic-embed-text   # только при EMBEDDER=ollama
```
Миграции применяет one-shot сервис `migrate` **автоматически** до старта API (`api depends_on
migrate: service_completed_successfully`). Запускать `db:deploy` вручную не нужно.

> **Прод-секреты обязательны.** `api` стартует с `NODE_ENV=production`, и конфиг **падает при
> старте**, если `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` — дефолтные из `.env.example` или короче
> 32 символов. Сгенерировать: `openssl rand -base64 48`.
В compose `environment` перекрывает `.env` сетевыми DNS-адресами (`postgres`/`redis`/`qdrant`/
`ollama`), т.к. URL в `.env` указывают на host-порты. API публикуется на `3000:3000`.

`mcp` в compose нет: MCP — stdio-сервер, его запускает MCP-клиент (Claude Code/Cursor), а не демон.
Его образ при необходимости собирается отдельно: `docker build -f apps/mcp/Dockerfile -t brain-dock-mcp .`

> Registry/публикация образов — только если появятся несколько нод или k8s (тогда «собрал один раз
> — `pull` на все»). Сейчас не нужно.

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
