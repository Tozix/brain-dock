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
| **API** (`apps/api`) | `3000` | REST: пользователи, API-ключи, проекты, репозитории, память/знания/документы, запуск индексации. Swagger: `/api/v1/docs` |
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
export API_PORT=3000 MCP_HTTP_PORT=8080

bun --no-addons run apps/api/src/main.ts        # REST API     → http://localhost:3000
bun --no-addons run apps/workers/src/index.ts   # index worker
bun run apps/mcp/src/http.ts                     # remote MCP   → http://localhost:8080/mcp
```

> `--no-addons` обязателен для api/workers (BullMQ тянет нативный модуль, несовместимый с Bun без
> этого флага). Если порт `3000` занят — задайте другой `API_PORT`.

Проверка: `curl localhost:3000/health/ready` → `{"status":"ok",…}`, `curl localhost:8080/health` → `ok`.

### 2.2. Вариант B — всё в Docker (как на проде, но локально)

```bash
cp .env.example .env             # для dev дефолтные секреты подойдут
bun run deploy                   # = docker compose --profile app up -d --build
```
Поднимется инфра + `migrate` (применит миграции) + `api` (3000) + `workers` + `mcp` (8080).

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
- Поднимаются: `api` (`:3000`), `mcp` (`:8080`), `workers`, инфра.

### 3.3. Reverse-proxy + TLS (рекомендуется)

Спрячьте `:8080` (MCP) и `:3000` (API) за nginx/Caddy с HTTPS. Пример Caddy:

```
mcp.example.com   { reverse_proxy localhost:8080 }
api.example.com   { reverse_proxy localhost:3000 }
```
Тогда клиенты подключаются к `https://mcp.example.com/mcp`. CORS не нужен (MCP-клиенты — не браузеры).

### 3.4. Где лежит индексируемый код (важно)

Воркер индексирует **путь на сервере** (`repository.root`). Для контейнерного деплоя примонтируйте
каталог с кодом в контейнер `workers` и используйте этот путь как `root`. Пример — добавьте в
`docker-compose.yml` в сервис `workers`:

```yaml
    volumes:
      - /srv/repos:/repos:ro    # код пользователя на хосте → /repos в контейнере
```
и при создании репозитория укажите `root: "/repos/my-project"` (см. §5).

> Прямого подключения git пока нет — код должен быть доступен воркеру как путь в файловой системе.

---

## 4. Создание пользователя и API-ключа (токена)

```bash
API=http://localhost:3000/api/v1     # или https://api.example.com/api/v1

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
API=http://localhost:3000/api/v1

# Проект
curl -s -X POST $API/projects -H "x-api-key: $T" -H 'content-type: application/json' \
  -d '{"name":"My App","slug":"my-app"}'
PID=<id-проекта-из-ответа>

# Репозиторий (root — путь к коду, доступный воркеру; см. §3.4)
curl -s -X POST $API/projects/$PID/repositories -H "x-api-key: $T" -H 'content-type: application/json' \
  -d '{"name":"My App","alias":"my-app","root":"/repos/my-app"}'
RID=<id-репозитория>

# Запустить индексацию (ставит задачу в очередь; воркер обработает)
curl -s -X POST $API/projects/$PID/repositories/$RID/reindex -H "x-api-key: $T"
```

Полная REST-документация (Swagger UI): `http://localhost:3000/api/v1/docs`.

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

### 6.2. Заголовки

- `Authorization: Bearer bd_…` — ваш API-ключ (пользователь).
- `X-Project: <slug-или-id>` — какой проект обслуживать. Без него доступен только `list_projects`,
  остальные инструменты попросят задать проект. Для разных проектов заведите несколько записей
  MCP-серверов (или меняйте `X-Project`).

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

---

## 7. Инструменты MCP (что отдаёт сервер)

Сервер публикует их автоматически; ниже — справочник.

| Инструмент | Назначение |
|---|---|
| `list_projects` | Список ваших проектов (узнать slug/id для `X-Project`) |
| `search_code` | Гибридный (вектор+ключевые слова) поиск по коду |
| `generate_context` | Собранный intent-aware контекст по запросу (для LLM) |
| `search_everywhere` | Единый поиск: код + память + знания + документы |
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

> Структурные/граф-инструменты (`find_*`, `get_architecture`, `impact`, `export_graph`) работают
> после индексации репозитория (§5). Семантический поиск тем лучше, чем `EMBEDDER=ollama`.

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
- **Метрики:** API `GET /metrics` (Prometheus).
- **Трейсинг (опц.):** `OTEL_TRACES_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_ENDPOINT=…` (api+workers,
  трейс `reindex` тянется до воркера).
- **Rate limit MCP:** `MCP_RATE_LIMIT_MAX` / `MCP_RATE_LIMIT_WINDOW_MS` (per-ключ).
- **Логи (docker):** `docker compose logs -f mcp api workers`.

---

## 10. Частые проблемы

| Симптом | Причина / решение |
|---|---|
| API не стартует на проде, ошибка про `JWT_*` | Заданы дефолтные/короткие секреты — см. §3.1. |
| MCP `401` | Неверный/неактивный API-ключ в `Authorization`. |
| MCP-инструмент просит «set X-Project» | Не задан заголовок `X-Project` — укажите slug/id (см. `list_projects`). |
| MCP `429` | Превышен per-ключ лимит — поднимите `MCP_RATE_LIMIT_MAX` или подождите окно. |
| Структурные tools пусты | Репозиторий ещё не проиндексирован — запустите `reindex` (§5) и дождитесь воркера. |
| Слабый семантический поиск | Стоит `EMBEDDER=deterministic` — переключите все сервисы на `ollama` и переиндексируйте. |
| Воркер не видит код | `repository.root` недоступен контейнеру — примонтируйте каталог (см. §3.4). |
</content>
