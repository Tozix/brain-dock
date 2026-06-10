# FAQ

Частые вопросы и проблемы. Симптомы и решения подробнее — [GUIDE.md §10](../GUIDE.md).

### 1. `api`/`workers` падают при старте с ошибкой про нативный модуль
Запускайте их с флагом **`--no-addons`**: `bun --no-addons run apps/api/src/main.ts` (и так же
workers). BullMQ тянет нативный модуль, несовместимый с Bun без этого флага. MCP HTTP-серверу
флаг не нужен.

### 2. Поиск возвращает мусор / нерелевантные результаты
Проверьте, что **`EMBEDDER` одинаков у всех сервисов** (api, workers, mcp), пишущих в одну
Qdrant-коллекцию: `deterministic` и `ollama` дают несравнимые векторы. И помните: `deterministic` —
для dev/оффлайна, реальное семантическое качество даёт только `EMBEDDER=ollama` (+ реиндекс).

### 3. Сменил эмбеддер/модель — индексация падает с ошибкой про vector size
Так и задумано: размерность векторов привязана к коллекции, и `ensureCollection` теперь падает с
понятной ошибкой («…has vector size N, but the embedder needs M — reindex into a new collection or
change COLLECTION») вместо тихой порчи индекса. Решение: новая коллекция (env `COLLECTION`) +
полный реиндекс.

### 4. `find_*` / `get_architecture` / `repo_map` возвращают пусто
Репозиторий ещё не проиндексирован (символы не записаны в Postgres). Вызовите MCP-tool
**`index_status`** — он покажет статус (QUEUED/INDEXING/READY/FAILED) и ошибку, если она была.
Запустить индексацию: `trigger_reindex` (MCP) или upload-индексация по REST (см.
[GUIDE.md §5](../GUIDE.md)).

### 5. Upload-индексация отвечает `413`
Суммарный размер файлов в одном запросе превысил бюджет `INDEX_UPLOAD_MAX_TOTAL_BYTES`
(по умолчанию 50 МБ). Поднимите лимит в `.env` или выгружайте меньше файлов (исключите
сгенерированное/вендорное).

### 6. MCP отвечает `429` (rate limit)
Превышен per-key лимит: `MCP_RATE_LIMIT_MAX` за окно `MCP_RATE_LIMIT_WINDOW_MS`. Для конкретного
ключа лимит можно переопределить полем `ApiKey.rateLimit`. Есть и pre-auth лимит по IP
(`MCP_IP_RATE_LIMIT`). Подождите окно (`Retry-After`) или поднимите лимиты.

### 7. API не стартует в production
С `NODE_ENV=production` конфиг **намеренно падает**, если `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
оставлены дефолтными из `.env.example` или короче 32 символов. Сгенерируйте:
`openssl rand -base64 48`. Также в prod громко предупреждаются deterministic-эмбеддер и дефолтный
пароль БД — поменяйте их.

### 8. `reindex` по серверному пути не работает на проде
В production реиндекс по `repository.root` по умолчанию **отключён** (`INDEX_SERVER_PATHS=false`) —
hosted-путь это upload-индексация `POST /projects/:pid/repositories/:id/index` (VSCode-расширение
делает её автоматически). Включайте флаг только для self-host, где код реально лежит на сервере.
