# brain-dock — руководство по развёртыванию и подключению MCP

Полная инструкция: как развернуть brain-dock **локально** и **на удалённом сервере**, выпустить
API-ключ, проиндексировать код и подключить **Claude Code** (и другие MCP-клиенты) к нашему
удалённому MCP-серверу.

> **Модель продукта (как vexp.dev).** Сервер (API + Qdrant + модели + MCP) крутится на нашем
> сервере. Пользователь получает **API-ключ** и подключает MCP-клиент к **нашему удалённому
> MCP-эндпоинту по HTTP** — локально у него ничего не запускается, только вызовы нашего API.

---

## 0. Архитектура (кратко)

| Сервис | Порт (по умолчанию) | Назначение |
|---|---|---|
| **API** (`apps/api`) | `3100` | REST: пользователи, API-ключи, проекты, репозитории, память/знания/документы, запуск индексации. Swagger: `/api/v1/docs` |
| **MCP** (`apps/mcp/src/http.ts`) | `8080` | Удалённый MCP по Streamable HTTP — сюда подключаются AI-клиенты. Путь `/mcp` |
| **Workers** (`apps/workers`) | — | Фоновая индексация (BullMQ): код → эмбеддинги (Qdrant) + символьный граф (Postgres) |
| Postgres / Qdrant / Redis / Ollama | `15432 / 16333 / 16379 / 11434` | Инфраструктура (Docker Compose) |

Поток: репозиторий → воркер индексирует → векторы в **Qdrant** и символы/граф в **Postgres** →
MCP отдаёт это AI-клиенту, скоупя по пользователю (API-ключ) и проекту (заголовок `X-Project`).

---

## 1. Предварительные требования

- **Docker** + Docker Compose (для инфраструктуры и/или прод-деплоя).
- **Bun** ≥ 1.3 ([bun.sh](https://bun.sh)) — для локальной разработки и сборки.
- Свободные порты (или поменяйте их через env).

---

## 2. Локальное развёртывание

### 2.1. Вариант A — разработка (сервисы через Bun, инфра в Docker)

```bash
git clone <repo> && cd brain-dock
cp .env.example .env
bun install
bun run infra:up                 # Postgres, Qdrant, Redis, Ollama (docker compose)
bun run db:migrate               # применить миграции Prisma

# (опционально, только для EMBEDDER=ollama) скачать модель эмбеддингов:
docker exec brain-dock-ollama ollama pull nomic-embed-text
```

Запустить три сервиса (каждый в своём терминале или одной строкой):

```bash
set -a; source .env; set +a
export EMBEDDER=deterministic            # offline/быстро; для качества семантики → ollama
export API_PORT=3100 MCP_HTTP_PORT=8080

bun --no-addons run apps/api/src/main.ts        # REST API     → http://localhost:3100
bun --no-addons run apps/workers/src/index.ts   # index worker
bun run apps/mcp/src/http.ts                     # remote MCP   → http://localhost:8080/mcp
```

> `--no-addons` обязателен для api/workers (BullMQ тянет нативный модуль, несовместимый с Bun без
> этого флага). Если порт `3100` занят — задайте другой `API_PORT`.

Проверка: `curl localhost:3100/health/ready` → `{"status":"ok",…}`, `curl localhost:8080/health` → `ok`.

### 2.2. Вариант B — всё в Docker (как на проде, но локально)

```bash
cp .env.example .env             # для dev дефолтные секреты подойдут
bun run deploy                   # = docker compose --profile app up -d --build
```
Поднимется инфра + `migrate` (применит миграции) + `api` (3100) + `workers` + `mcp` (8080).

---

## 3. Развёртывание на удалённом сервере

На сервере с Docker:

```bash
git clone <repo> && cd brain-dock
cp .env.example .env
```

### 3.1. Обязательно: задать прод-секреты в `.env`

API стартует с `NODE_ENV=production` и **упадёт при старте**, если JWT-секреты дефолтные или
короче 32 символов. Сгенерируйте сильные:

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"   >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"  >> .env
# и поменяйте пароль Postgres в docker-compose.yml + DATABASE_URL, если сервер публичный.
```

Для реального семантического поиска в `.env` поставьте `EMBEDDER=ollama` (по умолчанию
`deterministic`). После старта скачайте модель: `docker exec brain-dock-ollama ollama pull nomic-embed-text`.

### 3.2. Запуск

```bash
bun run deploy        # docker compose --profile app up -d --build
```
- Образы **собираются на сервере** (registry не используется).
- Миграции применяются автоматически one-shot сервисом `migrate` **до** старта API.
- Поднимаются: `web` (`:3300`), `api` (`:3100`), `mcp` (`:8080`), `workers`, инфра.
  Все app-порты публикуются **только на 127.0.0.1** — наружу смотрит host-nginx (§3.3).

### 3.3. Host-nginx + TLS (один домен, рекомендуется)

nginx живёт **на хост-машине**, всё остальное — в контейнерах. Готовый конфиг:
[deploy/nginx/brain-dock.ru.conf](../deploy/nginx/brain-dock.ru.conf) — один домен
(`brain-dock.ru`), маршрутизация по путям:

| Путь | Куда | Особенности |
|---|---|---|
| `/` | web `:3300` | SPA (веб-кабинет + админка) |
| `/api/v1` | api `:3100` | `client_max_body_size 64m`, таймаут 300с (upload-индексация) |
| `/mcp`, `/mcp/{slug}` | mcp `:8080` | `proxy_buffering off` (SSE), таймаут 600с |

```bash
sudo cp deploy/nginx/brain-dock.ru.conf /etc/nginx/sites-available/brain-dock.ru
sudo ln -s /etc/nginx/sites-available/brain-dock.ru /etc/nginx/sites-enabled/
sudo certbot --nginx -d brain-dock.ru -d www.brain-dock.ru
sudo nginx -t && sudo systemctl reload nginx
```

Веб и API на одном origin — CORS не нужен. MCP-клиенты подключаются к
`https://brain-dock.ru/mcp/<project-slug>`. `/metrics` наружу не проксируется.
Вариант с поддоменами (Caddy) остаётся валидным для self-host без веба:
`mcp.example.com { reverse_proxy localhost:8080 }`.

### 3.4. Откуда берётся индексируемый код (важно)

Код **не обязан лежать на сервере**. Основной hosted-путь — **upload-индексация**: клиент
выгружает файлы прямо в запросе `POST /api/v1/projects/:pid/repositories/:id/index` (пути +
контент); сервер кладёт их в staging-каталог (том, общий с воркером), ставит задачу и **сразу
отвечает `202 QUEUED`** — индексирует фоновый воркер и затем удаляет staging. VSCode-расширение
(§6.4) делает это автоматически и дожидается статуса. Суммарный размер одной выгрузки ограничен
`INDEX_UPLOAD_MAX_TOTAL_BYTES` (по умолчанию 50 МБ); staging-каталог задаётся `INDEX_STAGING_DIR`.

Альтернатива для self-host — индексация **пути на сервере** (`repository.root` + `POST
…/reindex`): воркер читает код из файловой системы. В prod этот путь по умолчанию **отключён**
(`INDEX_SERVER_PATHS=false`) — включайте осознанно и только если код действительно лежит на
сервере. Для контейнерного деплоя примонтируйте каталог с кодом в контейнер `workers`:

```yaml
    volumes:
      - /srv/repos:/repos:ro    # код пользователя на хосте → /repos в контейнере
```
и при создании репозитория укажите `root: "/repos/my-project"` (см. §5).

> Прямого подключения git пока нет — либо upload, либо путь в файловой системе сервера.

---

## 4. Создание пользователя и API-ключа (токена)

```bash
API=http://localhost:3100/api/v1     # или https://api.example.com/api/v1

# 1) Регистрация. ПЕРВЫЙ зарегистрированный пользователь автоматически становится SUPER_ADMIN.
curl -s -X POST $API/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"<надёжный-пароль>"}'
# → в ответе accessToken (JWT). Сохраните его в $ACC:
ACC=<accessToken-из-ответа>

# 2) Выпустить API-ключ (это и есть «токен» для MCP). Только SUPER_ADMIN.
curl -s -X POST $API/api-keys -H "authorization: Bearer $ACC" \
  -H 'content-type: application/json' -d '{"name":"my-key"}'
# → { "key": "bd_…" }  ← показывается ОДИН раз, сохраните.
```

Один ключ привязан к пользователю; проектов у пользователя может быть сколько угодно.

---

## 5. Создать проект и проиндексировать код

```bash
T=bd_…           # ваш API-ключ
API=http://localhost:3100/api/v1

# Проект
curl -s -X POST $API/projects -H "x-api-key: $T" -H 'content-type: application/json' \
  -d '{"name":"My App","slug":"my-app"}'
PID=<id-проекта-из-ответа>

# Репозиторий (root — метка/путь; для upload-индексации точкой может быть просто ".")
curl -s -X POST $API/projects/$PID/repositories -H "x-api-key: $T" -H 'content-type: application/json' \
  -d '{"name":"My App","alias":"my-app","root":"/repos/my-app"}'
RID=<id-репозитория>

# Вариант A (основной, hosted): выгрузить файлы на индексацию — код не нужен на сервере.
# Эндпоинт ставит задачу в очередь и сразу отвечает 202 {status:"QUEUED"} — индексирует фоновый
# воркер; следите за прогрессом через .../status (QUEUED → INDEXING → READY/FAILED).
curl -s -X POST $API/projects/$PID/repositories/$RID/index -H "x-api-key: $T" \
  -H 'content-type: application/json' \
  -d '{"files":[{"path":"src/main.ts","content":"…"}, …]}'
# (VSCode-расширение из §6.4 собирает и выгружает файлы автоматически)

# Вариант B (self-host, код лежит на сервере; в prod требует INDEX_SERVER_PATHS=true)
curl -s -X POST $API/projects/$PID/repositories/$RID/reindex -H "x-api-key: $T"

# Статус индексации (QUEUED / INDEXING / READY / FAILED + счётчики файлов/символов)
curl -s $API/projects/$PID/repositories/$RID/status -H "x-api-key: $T"
```

Полная REST-документация (Swagger UI): `http://localhost:3100/api/v1/docs`.
Профиль проекта (markdown ≤4КБ, подмешивается первым блоком в `generate_context`):
`GET`/`PUT $API/projects/$PID/profile`.

---

## 6. Подключение в Claude Code

### 6.1. Конфигурация

Claude Code подключается к удалённому MCP по URL с заголовками. Добавьте сервер:

```bash
claude mcp add --transport http brain-dock https://mcp.example.com/mcp \
  --header "Authorization: Bearer bd_…" \
  --header "X-Project: my-app"
```

…либо вручную в конфиг MCP (`~/.claude.json` / настройки проекта):

```json
{
  "mcpServers": {
    "brain-dock": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer bd_…",
        "X-Project": "my-app"
      }
    }
  }
}
```

Локально URL — `http://localhost:8080/mcp`. Для **Cursor** аналогично: в его `mcp.json` укажите
`url` + те же `headers`.

Проект можно выбрать и **URL-путём** вместо заголовка — `https://mcp.example.com/mcp/my-app`
(slug или id; путь **приоритетнее** `X-Project`). Удобно для клиентов, которые не умеют
кастомные заголовки кроме `Authorization`:

```bash
claude mcp add --transport http brain-dock https://mcp.example.com/mcp/my-app \
  --header "Authorization: Bearer bd_…"
```

### 6.2. Заголовки

- `Authorization: Bearer bd_…` — ваш API-ключ (пользователь).
- `X-Project: <slug-или-id>` — какой проект обслуживать (либо путь `/mcp/{slug-или-id}`, он
  приоритетнее). Без проекта доступен только `list_projects`, остальные инструменты попросят его
  задать. Для разных проектов заведите несколько записей MCP-серверов (или меняйте `X-Project`/путь).

### 6.3. Получает ли Claude Code список команд с сервера? — ДА.

**Перечислять команды вручную не нужно.** При подключении MCP-клиент сам вызывает `tools/list` и
получает актуальный набор инструментов с их схемами прямо с нашего сервера. В Claude Code проверить:

```bash
claude mcp list           # увидеть подключённый сервер и его статус
# внутри сессии:
/mcp                      # список MCP-серверов и их инструментов
```

Модель сама вызывает нужные инструменты по ходу диалога; можно и явно: «через brain-dock найди
сервис AuthService», «построй контекст по теме X».

### 6.4. VSCode-расширение (быстрый путь, аналог VEXP)

Вместо ручного `claude mcp add` есть расширение `apps/vscode-extension` (`@brain-dock-vscode`):
боковая панель со статусом индекса (символы/файлы/репозитории), Token Savings и кнопкой
**Setup Agents**, которая в один клик прописывает наш remote MCP в конфиги агентов.

Собрать и установить локально:

```bash
cd apps/vscode-extension
bun install && bun run build && bun run package   # → brain-dock.vsix
code --install-extension brain-dock.vsix          # или: Extensions → … → Install from VSIX
```

В панели: задайте `brainDock.serverUrl` / `brainDock.mcpUrl`, нажмите **Connect** (вставьте `bd_…`
ключ — он хранится в SecretStorage), выберите проект и нажмите **Setup Agents**. Выберите цели —
**Claude Code** (project `.mcp.json` / global `~/.claude.json`) и/или **Cursor** (`.cursor/mcp.json`).
Файлы содержат API-ключ — добавьте их в `.gitignore`, если репозиторий общий.

> Прочие кнопки: Force Re-index, Generate Context Capsule, Add / Connect Repository, View Logs.

---

## 7. Инструменты MCP (что отдаёт сервер)

Сервер публикует их автоматически; ниже — справочник.

| Инструмент | Назначение |
|---|---|
| `list_projects` | Список ваших проектов (узнать slug/id для `X-Project`) |
| `search_code` | Гибридный (вектор + BM25, RRF) поиск по коду |
| `generate_context` | Собранный intent-aware контекст по запросу (для LLM); первым блоком идёт профиль проекта |
| `search_everywhere` | Единый поиск: код + память + знания + документы |
| `get_project_profile` / `update_project_profile` | Профиль проекта (markdown ≤4КБ, «core memory») |
| `index_status` | Статус индексации репозиториев (QUEUED/INDEXING/READY/FAILED, счётчики) |
| `trigger_reindex` | Поставить переиндексацию в очередь (дедуп, если уже QUEUED/INDEXING) |
| `repo_map` | Карта репозитория: важнейшие символы (Personalized PageRank) под токен-бюджет |
| `find_symbol` | Поиск символа по имени |
| `find_controller` / `find_service` / `find_module` / `find_guard` / `find_repository` | Поиск по NestJS-роли |
| `find_endpoint` | HTTP-маршруты контроллеров |
| `summarize_project` | Сводка: файлы/символы, разбивка по ролям |
| `get_architecture` | Модули, контроллеры с маршрутами, DI-связи |
| `find_dependencies` / `find_dependents` / `impact` | Граф зависимостей и транзитивный blast radius |
| `export_graph` | Экспорт графа зависимостей (JSON или Graphviz DOT) |
| `remember` / `search_memory` | Долговременная память проекта |
| `save_knowledge` / `search_knowledge` | База знаний (ADR/архитектура/FAQ…) |
| `save_document` / `search_docs` | Документы (md/txt/pdf/docx…) |

> Структурные/граф-инструменты (`find_*`, `get_architecture`, `impact`, `export_graph`, `repo_map`)
> работают после индексации репозитория (§5) — если они пустые, проверьте `index_status`.
> Семантический поиск тем лучше, чем `EMBEDDER=ollama`.

---

## 8. Проверка подключения без клиента (curl)

```bash
curl -s https://mcp.example.com/mcp \
  -H "Authorization: Bearer bd_…" -H "X-Project: my-app" \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
Вернётся список инструментов — тот же, что получит Claude Code.

---

## 9. Эксплуатация

- **Health:** API `GET /health/ready` (проверяет Postgres/Qdrant/Redis, в режиме ollama — и модель);
  MCP `GET /health`.
- **Метрики:** API `GET /metrics` (Prometheus); если задан `METRICS_TOKEN`, эндпоинт требует
  `Authorization: Bearer <token>`.
- **Usage:** `GET /api/v1/usage?days=30` — дневная статистика вызовов MCP вашим ключом
  (calls / tokens served; её же показывает панель VSCode-расширения).
- **Трейсинг (опц.):** `OTEL_TRACES_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_ENDPOINT=…` (api+workers,
  трейс `reindex` тянется до воркера).
- **Rate limit MCP:** `MCP_RATE_LIMIT_MAX` / `MCP_RATE_LIMIT_WINDOW_MS` (per-ключ; поле
  `ApiKey.rateLimit` перекрывает лимит для конкретного ключа) + pre-auth `MCP_IP_RATE_LIMIT` по IP.
- **Прочие env hardening-настройки:** `TRUST_PROXY` (реальный IP за reverse-proxy),
  `CORS_ORIGINS`, `MCP_MAX_BODY_BYTES` (лимит тела → 413), `MCP_REQUEST_TIMEOUT_MS` (зависший
  запрос → 504), `INDEX_UPLOAD_MAX_TOTAL_BYTES`, `INDEX_SERVER_PATHS`, `POSTGRES_USER`/
  `POSTGRES_PASSWORD`/`POSTGRES_DB` (креды контейнера Postgres). Полный список — [.env.example](../.env.example).
- **Логи (docker):** `docker compose logs -f mcp api workers` (ротация настроена в compose).

---

## 10. Частые проблемы

| Симптом | Причина / решение |
|---|---|
| API не стартует на проде, ошибка про `JWT_*` | Заданы дефолтные/короткие секреты — см. §3.1. |
| MCP `401` | Неверный/неактивный API-ключ в `Authorization`. |
| MCP-инструмент просит «set X-Project» | Не задан заголовок `X-Project` — укажите slug/id (см. `list_projects`). |
| MCP `429` | Превышен per-ключ лимит — поднимите `MCP_RATE_LIMIT_MAX` (или `ApiKey.rateLimit` ключа) или подождите окно. |
| Структурные tools пусты | Репозиторий ещё не проиндексирован — проверьте `index_status`, запустите индексацию (§5) и дождитесь READY. |
| `413` на upload-индексации | Выгрузка больше бюджета — поднимите `INDEX_UPLOAD_MAX_TOTAL_BYTES` или выгружайте меньше файлов. |
| `reindex` отвечает, что путь отключён | В prod `INDEX_SERVER_PATHS=false` — используйте upload-индексацию (§3.4) или включите флаг. |
| Слабый семантический поиск | Стоит `EMBEDDER=deterministic` — переключите все сервисы на `ollama` и переиндексируйте. |
| Воркер не видит код | `repository.root` недоступен контейнеру — примонтируйте каталог (см. §3.4) или используйте upload-индексацию. |
</content>
