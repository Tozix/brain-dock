# 051 — Закрытие полного аудита проекта (102 находки + 14 от критика)

**Status:** Done
**Фаза:** Hardening / Production readiness
**Дата:** 2026-06-10
**Связи:** [041-e2e-verification](041-e2e-verification-and-improvements.md) ·
[046-index-uploaded-files-no-git](046-index-uploaded-files-no-git.md) ·
[050-ollama-embedding-truncation](050-ollama-embedding-truncation-and-dev-ollama.md)

## Контекст

Многоагентный аудит всей кодовой базы (9 направлений: незавершённая работа, незакрытые планы,
корректность api/workers/mcp, безопасность multi-tenant, актуальность доков, VSCode-расширение,
пробелы тестов; каждая находка адверсариально проверена) дал **102 подтверждённые находки**
плюс 14 дополнений критика полноты. Этот план закрывает всё, что не требует отдельной фазы.

## Сделано (по зонам)

### Ядро индексации (`packages/{search,storage,indexer,embedding}`)
- **(HIGH)** Point id в Qdrant теперь скоупирован: `uuidFromHash(sha256(projectId:repo:chunkId))` —
  раньше один тенант мог перезаписать векторы другого.
- **(HIGH)** `ingestIndex` после upsert'а вычищает осиротевшие точки скоупа (scroll по фильтру
  projectId+repo → diff → delete) — полный reindex больше не копит orphan-векторы; окно пустого
  индекса отсутствует (upsert-first).
- `ensureCollection` проверяет размерность существующей коллекции (понятная ошибка при смене
  эмбеддера 256↔768), создаёт только на 404, сетевые ошибки пробрасывает, гонка создания терпима.
- Проверка `embeddings.length === input.length` (Ollama) и `vectors.length === chunks.length` —
  сдвиг векторов на чужие чанки исключён. `deletePath` глотает только 404.
- Нечитаемый файл больше не валит индексирование репозитория (skip + warn + `IndexStats.skippedFiles`).
- Ollama fetch с `AbortSignal.timeout` (60s, конфигурируемо). UnifiedSearch логирует падение
  каждого источника (`[unified-search] source X failed`) вместо тихой деградации.

### Инфраструктура и деплой (`docker-compose.yml`, Dockerfiles, CI)
- **(HIGH)** Учётки Postgres — из env (`POSTGRES_USER/PASSWORD/DB`); все инфра-порты привязаны к
  `127.0.0.1` (раньше Redis/Qdrant/Ollama торчали на 0.0.0.0 без auth).
- Healthchecks: qdrant (TCP-проба `/dev/tcp`), ollama (`ollama list`), api/mcp (`bun -e fetch /health`);
  `depends_on: service_healthy`. Лог-ротация (json-file 10m×3) и mem-лимиты (ollama 4g, workers 2g, api 1g).
- Образы запинены: `qdrant/qdrant:v1.18.2`, `ollama/ollama:0.30.7` (и в CI). `bun install
  --frozen-lockfile` в Dockerfile'ах и CI. Прод-образы под `USER bun`. One-shot `ollama-pull`
  тянет embedding-модель при деплое. LICENSE (MIT) в корне.

### REST API (`apps/api`, `packages/knowledge`)
- Глобальный exception filter — единый конверт ошибок `{code,message,details?}`, маппинг Prisma
  P2023/P2025, без утечки внутренних сообщений. UUID-валидация path-параметров.
- Пагинация `take/skip` (Zod, cap 200) на всех списках. `GET /audit` (ADMIN+) с фильтрами.
- `trust proxy` из env `TRUST_PROXY`; security-заголовки + CORS-allowlist (`CORS_ORIGINS`);
  `/metrics` опционально за `METRICS_TOKEN`; `algorithms: ['HS256']` в verifyAsync.
- `lastUsedAt` API-ключа — fire-and-forget, не чаще раза в 60с. In-memory limiter вычищает
  истёкшие окна. BullMQ-очередь: attempts 3 + exp backoff + removeOnComplete/Fail.
- **(SEC)** Реиндекс по серверному пути гейтится `INDEX_SERVER_PATHS` (в проде по умолчанию выключен —
  hosted-пользователи индексируют через upload). Бюджет upload-индексации
  (`INDEX_UPLOAD_MAX_TOTAL_BYTES`) + yield в цикле парсинга.
- Компенсация двойной записи: падение Qdrant при create memory/knowledge/document откатывает
  строку Postgres. Лимиты контента в схемах knowledge (2 МБ).
- Громкий warning при `EMBEDDER=deterministic` или дефолтном пароле БД в production.

### Целостность данных (Prisma, миграция `cascade_fks_and_audit_index`)
- FK + `onDelete: Cascade` на `MemoryItem`/`KnowledgeItem`/`Document` (с кастом колонки
  text→uuid через `USING` и предварительной чисткой орфанов), `CodeSymbol`/`CodeEdge` → Project,
  `McpUsageDaily` → User. Индекс `audit_logs(created_at)`.
- Удаление проекта чистит и Qdrant: `VectorCleanupService.purgeProject` по всем коллекциям
  (best-effort: недоступный Qdrant не блокирует удаление, остатки недостижимы из-за
  projectId-фильтров; потеря логируется).

### Hosted MCP (`apps/mcp`)
- **(HIGH→закрыто)** e2e по реальному HTTP (`http.e2e.test.ts`, RUN_E2E) + юнит-тесты handler'а
  и **всех remote tools** (`tools.test.ts` — был ноль покрытия на 446 строк).
- Ошибки tools: серверный лог + generic-ответ клиенту (доменные ошибки сохраняются).
  GET/DELETE `/mcp` → 405. Таймаут запроса (`MCP_REQUEST_TIMEOUT_MS`, 504 + закрытие транспорта).
- Per-key rate limit: применяется `ApiKey.rateLimit` (ключ лимитера — keyId, не userId).
  Pre-auth лимит по IP (`MCP_IP_RATE_LIMIT`) и лимит тела (`MCP_MAX_BODY_BYTES` → 413).
- Auth: один запрос с include user; `lastUsedAt` fire-and-forget с дебаунсом. Валидация числовых
  env при старте. Graceful shutdown (SIGTERM → drain → disconnect).

### Workers (`apps/workers`)
- Graceful shutdown (`worker.close()` дожидается активного job). `lockDuration` поднят,
  REDIS_URL передаётся в ioredis целиком (пароль/TLS больше не теряются).
- Watch-all не падает от одного битого репозитория; rename-события не фильтруются по расширению
  (удаления каталогов видны); reconcile стейлов делает `ingestIndex`.
- Падение persist символов после записи векторов логируется и фейлит job (ретраи очереди).

### VSCode-расширение (`apps/vscode-extension`)
- **(HIGH)** `Setup Agents` больше не может затереть `~/.claude.json` (битый JSON → ошибка,
  атомарная запись tmp+rename). **(HIGH)** `brainDock.project` пишется в Workspace-настройки.
- `ApiError` со статусом и телом ответа; ретрай создания проекта только при 409; таймауты fetch;
  подтверждение перед первой индексацией папки; бюджет выгрузки ~40 МБ; обработка disposed-webview;
  allowlist команд; '—' вместо нулей при сбое usage; чистка мёртвых i18n-ключей; фикс parseSummary.

## Тесты
До аудита: 155 pass. После: **277 pass / 17 skip / 0 fail** (+34 теста API/knowledge,
+юнит/e2e MCP remote, +QdrantStore, +workers, +extension). `bun run ci` зелёный.

## Отложено (бэклог → следующие планы)
- **Поиск/качество** — план 052 (префиксы nomic, eval-harness, суб-чанкинг, hybrid BM25+RRF).
- **MCP UX** — план 053 (instructions, readOnlyHint, /mcp/{slug}, профиль проекта,
  index_status/trigger_reindex, repo_map).
- Git-подключение репозиториев (P1 из плана 041) — отдельная фаза.
- Веб-UI / биллинг; Redis-backed rate limit MCP (multi-node); ротация refresh-токенов;
  структурное логирование (pino + LOG_LEVEL); бэкапы (pg_dump + qdrant snapshots) и процедура
  восстановления; перенос upload-индексации в очередь; change-coupling по git-истории.

## Definition of Done
- [x] Все HIGH-находки закрыты; MEDIUM закрыты или явно отложены с планом.
- [x] `bun run ci` зелёный; e2e remote MCP существует и проходит локально (RUN_E2E).
- [x] Миграция применяется на существующей базе без потери данных (кроме орфанов).
