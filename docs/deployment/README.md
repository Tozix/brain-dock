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
