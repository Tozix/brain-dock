# Go-live чек-лист (прод-деплой на сервер)

Короткий «pre-flight» перед боевым подъёмом `brain-dock.ru`. Подробный walkthrough — в
[GUIDE.md §3](../GUIDE.md); здесь — то, что нужно проверить по пунктам. Команды проверки даны.

> Что уже проверено в репозитории (статически): `docker compose --profile app config` валиден;
> присутствуют все 4 Dockerfile (`api`/`workers`/`mcp`/`web`); env-схема согласована с
> `.env.example`; nginx-маршруты совпадают с портами контейнеров (`/`→3300, `/api/v1`→3100,
> `/mcp`→8080); `bun run ci` зелёный.

> **На сервере нужен только Docker** (Compose v2). Bun/Node/Prisma ставить не нужно — образы
> собираются внутри Docker, миграции применяет контейнер `migrate`, модель тянет `ollama-pull`.
> Команды `bun run deploy`/`bun run backup` — лишь локальные алиасы; на сервере используйте прямые
> `docker compose …` и `bash scripts/…`.

## 0. Сервер
- [ ] Docker + Docker Compose v2 установлены (`docker compose version`). Больше ничего не требуется.
- [ ] **RAM ≥ 8 ГБ** (рекоменд. 12–16). Сумма mem-лимитов: ollama 4g + workers 2g + api 1g +
      Postgres/Qdrant/Redis. Меньше — риск OOM при индексации (ts-morph держит деревья в памяти).
- [ ] Диск под данные: тома `postgres-data`/`qdrant-data`/`redis-data`/`ollama-data` (модель
      `nomic-embed-text` ≈ 270 МБ + индексы). Заложите запас под рост Qdrant/Postgres.
- [ ] Порты `80`/`443` свободны для host-nginx; app-порты (3100/3300/8080) наружу **не** открыты.

## 1. Секреты и .env (обязательно)
- [ ] `cp .env.example .env`.
- [ ] `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` — сильные, ≥32 символов
      (`openssl rand -base64 48`). Иначе `api` **упадёт при старте** (`NODE_ENV=production`).
- [ ] `POSTGRES_PASSWORD` сменён с дефолтного `brain_dock` (публичный сервер).
- [ ] `EMBEDDER=ollama` (для реальной семантики; `deterministic` — только dev). Значение должно
      быть **одинаковым** в api/workers/mcp — в compose это один `.env`, ок.
- [ ] `TRUST_PROXY=true` (или число хопов) — за nginx, чтобы rate-limit видел реальный IP.
- [ ] (опц.) `METRICS_TOKEN`, `CORS_ORIGINS` (для same-origin веба не нужен), `MCP_RATE_LIMIT_MAX`.
- [ ] `INDEX_SERVER_PATHS` оставить пустым → в проде по умолчанию `false` (hosted-юзеры грузят файлы).

Проверка: если секреты дефолтные/короткие, контейнер `api` не стартует — это видно сразу после
подъёма стека: `docker compose logs api | tail` покажет ошибку валидации по `JWT_*`.

## 2. DNS + TLS
- [ ] A/AAAA-запись `brain-dock.ru` (и `www`) → IP сервера; распространилась (`dig +short brain-dock.ru`).
- [ ] nginx-конфиг установлен: `sudo cp deploy/nginx/brain-dock.ru.conf /etc/nginx/sites-available/…` + symlink.
- [ ] `sudo certbot --nginx -d brain-dock.ru -d www.brain-dock.ru` выпустил сертификат.
- [ ] `sudo nginx -t && sudo systemctl reload nginx`.

## 3. Подъём стека
- [ ] `docker compose --profile app up -d --build` (собирает образы на сервере и поднимает стек).
      Флаг `--profile app` включает app-сервисы (api/workers/mcp/web); без него поднимется только
      инфра (для dev). Чтобы не писать флаг каждый раз — раскомментируйте `COMPOSE_PROFILES=app` в
      `.env`, тогда хватит `docker compose up -d --build`.
- [ ] `migrate` отработал успешно (миграции применились до api/mcp):
      `docker compose logs migrate | tail`.
- [ ] `ollama-pull` скачал модель: `docker exec brain-dock-ollama ollama list` (есть `nomic-embed-text`).
- [ ] Все сервисы healthy: `docker compose ps` (api/mcp/web — `healthy`).

## 4. Дымовые проверки (с хоста)
- [ ] API readiness: `curl -s localhost:3100/health/ready` → `{"status":"ok",…}` (Postgres/Qdrant/Redis,
      в режиме ollama — и модель).
- [ ] MCP: `curl -s localhost:8080/health` → `ok`.
- [ ] Web: `curl -sI localhost:3300/` → `200`.
- [ ] Через домен: `curl -sI https://brain-dock.ru/` → `200`; `https://brain-dock.ru/api/v1/docs` открывается.

## 5. Первый пользователь и проверка MCP end-to-end
- [ ] Регистрация (первый юзер → `SUPER_ADMIN`): через веб `https://brain-dock.ru/` или
      `POST /api/v1/auth/register`.
- [ ] Выпустить API-ключ (`bd_…`) в веб-кабинете (self-service) или `POST /api/v1/api-keys`.
- [ ] Создать проект, загрузить папку (веб/расширение) → дождаться `READY` (`index_status`).
- [ ] Проверить MCP без клиента:
```bash
curl -s https://brain-dock.ru/mcp -H "Authorization: Bearer bd_…" -H "X-Project: <slug>" \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
      → вернётся список инструментов.

## 6. Эксплуатация (включить сразу)
- [ ] **Бэкапы** настроены: `bash scripts/backup.sh` по cron (см. [BACKUP.md](BACKUP.md); нужны
      только docker + curl + coreutils, без bun). Критичен Postgres.
- [ ] Логи смотрятся: `docker compose logs -f api mcp workers` (ротация настроена в compose).
- [ ] (опц.) Скрейп метрик изнутри хоста: `127.0.0.1:3100/metrics` (наружу nginx не проксирует).
- [ ] (опц.) Трейсинг: `OTEL_TRACES_EXPORTER=otlp` + `OTEL_EXPORTER_OTLP_ENDPOINT`.

## 7. Клиенты (VSCode / Claude Code)
- [ ] Расширение: `apps/vscode-extension/brain-dock.vsix` ставится в VSCode; дефолты уже на
      `brain-dock.ru` (план 055) — Connect ключом, выбрать проект, **Setup Agents**.
- [ ] Claude Code напрямую: `claude mcp add --transport http brain-dock https://brain-dock.ru/mcp/<slug> --header "Authorization: Bearer bd_…"`.
