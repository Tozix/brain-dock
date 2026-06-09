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
bun run infra:up      # docker compose up -d
bun run infra:down    # docker compose down
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
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) на push/PR: `bun install` → `bun run ci`
(db:generate → Biome → turbo typecheck → bun test). Локально: `bun run ci`.

## Docker-образы
Сборка из корня репозитория:
```bash
docker build -f apps/api/Dockerfile     -t brain-dock-api .
docker build -f apps/mcp/Dockerfile     -t brain-dock-mcp .
docker build -f apps/workers/Dockerfile -t brain-dock-workers .
```
Запуск API (host-сеть, env из .env):
```bash
docker run --rm --network host --env-file .env -e API_PORT=3300 brain-dock-api
# /health → 200, /health/ready → 200 (db.up: true)
```
Образы используют `bun install --omit=optional` (нативные optional-пакеты рантайму не нужны);
workers стартуют с `--no-addons` (BullMQ-на-Bun). Подробности — [плана 007](../plans/007-production-readiness.md).

## Воркеры
- Index-worker (BullMQ): `bun --no-addons run apps/workers/src/index.ts`.
- Инкрементальный watch-реиндекс: `PROJECT_ROOT=<dir> bun apps/workers/src/watch.ts` — следит за
  `.ts/.tsx` и переэмбеддит только изменённые файлы (см. [план 012](../plans/012-incremental-watch.md)).
