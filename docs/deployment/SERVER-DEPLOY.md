# Полная пошаговая инструкция: деплой brain-dock на сервер

Всё работает **в Docker**. На сервере нужен только **Docker + Docker Compose v2** — ни bun, ни
Node, ни Prisma ставить не нужно (образы собираются внутри Docker, миграции применяет контейнер
`migrate`, модель эмбеддингов тянет `ollama-pull`).

Сетевая модель (важно):
- **Инфра** (Postgres, Qdrant, Redis, Ollama) **не публикует портов на хост** — доступна только
  внутри Docker-сети по DNS-именам `postgres:5432` / `qdrant:6333` / `redis:6379` / `ollama:11434`.
- Наружу (на `127.0.0.1`) смотрят только **api** (`:3100`), **mcp** (`:8080`), **web** (`:3300`).
  Перед ними — **host-nginx**, который терминирует TLS и проксирует по путям.

Краткий чек-лист (тики) — [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md). Ниже — подробный нарратив.

---

## Шаг 0. Сервер
- ОС с Docker Engine + Compose v2 (`docker --version`, `docker compose version`).
- **RAM ≥ 8 ГБ** (рекоменд. 12–16): Ollama 4g + workers 2g + api 1g + Postgres/Qdrant/Redis.
- Диск с запасом под тома (Postgres + Qdrant индексы + модель `nomic-embed-text` ≈ 270 МБ).
- Открыты порты **80/443** (для nginx). Порты приложения (3100/3300/8080) **наружу не открывать** —
  они только на `127.0.0.1`, и ходит в них локальный nginx.
- Домен **brain-dock.ru** (и `www`) с A/AAAA-записью на IP сервера.

```bash
# (если нужен Docker) — официальный скрипт:
curl -fsSL https://get.docker.com | sh
docker compose version    # должно показать v2.x
```

## Шаг 1. Получить код
```bash
sudo mkdir -p /opt && cd /opt
git clone <repo-url> brain-dock && cd brain-dock
cp .env.example .env
```

## Шаг 2. Заполнить `.env` (обязательные прод-настройки)
Открой `.env` и задай:

```bash
# 1) Сильные JWT-секреты (иначе api НЕ стартует под NODE_ENV=production):
#    сгенерируй и вставь значения:
openssl rand -base64 48     # → в JWT_ACCESS_SECRET
openssl rand -base64 48     # → в JWT_REFRESH_SECRET

# 2) Сменить пароль Postgres:
POSTGRES_PASSWORD=<надёжный-пароль>

# 3) Реальный семантический поиск:
EMBEDDER=ollama

# 4) За nginx — видеть реальный IP клиента в rate-limit:
TRUST_PROXY=true

# 5) Удобство: чтобы не писать --profile app каждый раз — раскомментируй:
COMPOSE_PROFILES=app
```

> `DATABASE_URL`/`REDIS_URL`/`QDRANT_URL`/`OLLAMA_URL` в `.env` указывают на `localhost:<host-port>` —
> это для **локальной разработки**. В контейнерах эти значения **перекрываются** in-network DNS
> (`postgres:5432` и т.д.) автоматически — на сервере их трогать не нужно.

## Шаг 3. Поднять стек
```bash
# С COMPOSE_PROFILES=app в .env (шаг 2.5):
docker compose up -d --build

# Либо без него — с явным флагом профиля:
docker compose --profile app up -d --build
```
Что произойдёт по порядку (Compose ждёт healthchecks):
1. Поднимется инфра (postgres/qdrant/redis/ollama).
2. `migrate` применит Prisma-миграции и выйдет.
3. `ollama-pull` скачает модель эмбеддингов.
4. Стартуют `api`, `workers`, `mcp`, `web`.

Проверь:
```bash
docker compose ps                       # api/mcp/web — healthy; migrate — exited (0)
docker compose logs migrate | tail      # миграции применились
docker compose logs api | tail          # нет ошибок про JWT_* (иначе — вернись к шагу 2)
docker exec brain-dock-ollama ollama list   # есть nomic-embed-text
```

Дымовые проверки **с самого сервера** (порты только на 127.0.0.1):
```bash
curl -s localhost:3100/health/ready      # {"status":"ok",...}
curl -s localhost:8080/health            # ok
curl -sI localhost:3300/                 # 200
```

## Шаг 4. nginx на хосте + TLS
nginx живёт **на хост-машине** (не в контейнере), всё остальное — в Docker.
```bash
sudo apt-get install -y nginx        # если ещё не стоит
sudo cp deploy/nginx/brain-dock.ru.conf /etc/nginx/sites-available/brain-dock.ru
sudo ln -s /etc/nginx/sites-available/brain-dock.ru /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# TLS (Let's Encrypt) — certbot впишет ssl_* в конфиг:
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d brain-dock.ru -d www.brain-dock.ru

sudo nginx -t && sudo systemctl reload nginx
```
nginx проксирует: `/` → web `:3300`, `/api/v1` → api `:3100`, `/mcp` → mcp `:8080`
(SSE: `proxy_buffering off`, длинные таймауты). `/metrics` наружу не отдаётся.

Проверь через домен:
```bash
curl -sI https://brain-dock.ru/                 # 200
curl -s  https://brain-dock.ru/api/v1/docs      # Swagger открывается
```

## Шаг 5. Первый пользователь и API-ключ
- Открой `https://brain-dock.ru/` → **зарегистрируйся**. **Первый** пользователь автоматически
  становится `SUPER_ADMIN`.
- В веб-кабинете выпусти **API-ключ** (`bd_…`) — он показывается один раз.
- (Сделать ещё кого-то админом: Админка → Пользователи → сменить роль на ADMIN/SUPER_ADMIN;
  или `PATCH /api/v1/users/:id` телом `{"role":"ADMIN"}` от супер-админа.)

## Шаг 6. Проиндексировать проект и подключить клиента
- В кабинете: создай проект → загрузи папку (upload-индексация ставит задачу, статус идёт
  QUEUED → INDEXING → READY) **или** подключи VSCode-расширение (`apps/vscode-extension/brain-dock.vsix`,
  дефолты уже на `brain-dock.ru`) → Connect ключом → Setup Agents.
- Claude Code напрямую:
  ```bash
  claude mcp add --transport http brain-dock https://brain-dock.ru/mcp/<project-slug> \
    --header "Authorization: Bearer bd_…"
  ```
- Проверка MCP без клиента:
  ```bash
  curl -s https://brain-dock.ru/mcp -H "Authorization: Bearer bd_…" -H "X-Project: <slug>" \
    -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  ```

## Шаг 7. Бэкапы (настроить сразу)
`scripts/backup.sh` работает только через Docker (без хост-портов): `docker exec` для Postgres +
короткоживущий curl-контейнер в сети Qdrant. Нужны только docker + coreutils.
```bash
bash scripts/backup.sh        # разовый прогон → backups/<ts>/postgres-*.sql.gz (+ qdrant/*)
# cron, ежедневно в 03:30:
( crontab -l 2>/dev/null; echo "30 3 * * * cd /opt/brain-dock && /usr/bin/bash scripts/backup.sh >> /var/log/brain-dock-backup.log 2>&1" ) | crontab -
```
Восстановление — `bash scripts/restore.sh backups/<ts>`. Подробности — [BACKUP.md](BACKUP.md).
Рекомендуется дополнительно выгружать `backups/` off-site (rsync/S3).

---

## Эксплуатация
```bash
docker compose logs -f api mcp workers          # логи (ротация настроена)
docker compose ps                               # статусы/health
docker compose --profile app restart api        # перезапуск сервиса

# Обновление до новой версии кода:
cd /opt/brain-dock && git pull
docker compose up -d --build                    # пересоберёт изменённые образы; migrate сам накатит миграции
```
Метрики Prometheus — изнутри хоста: `curl -s localhost:3100/metrics` (наружу nginx не проксирует;
если задан `METRICS_TOKEN` — нужен `Authorization: Bearer <token>`).

## Частые проблемы
| Симптом | Решение |
|---|---|
| `api` не стартует, ошибка про `JWT_*` | Дефолтные/короткие секреты — задай сильные (шаг 2), `docker compose up -d`. |
| `docker compose up -d` поднял только БД | Не включён профиль `app` — добавь `--profile app` или `COMPOSE_PROFILES=app` в `.env`. |
| MCP `401` | Неверный/неактивный API-ключ. |
| Структурные tools пусты | Репозиторий не проиндексирован — дождись READY (`index_status`). |
| Слабый поиск | `EMBEDDER=deterministic` — поставь `ollama` и переиндексируй. |
| Бэкап пропускает Qdrant | Контейнер `brain-dock-qdrant` не запущен, либо нет образа `curlimages/curl` (он скачается сам). Postgres бэкапится в любом случае. |
