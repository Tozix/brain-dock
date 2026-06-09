# 046 — Индексация из загруженных файлов (без git и без пути на сервере)

**Status:** Done
**Фаза:** Hosted product / indexing
**Дата:** 2026-06-10
**Связи:** [045-vscode-auto-project-from-workspace](045-vscode-auto-project-from-workspace.md) ·
[037-server-symbol-index](037-server-symbol-index.md) · [041 P1](041-e2e-verification-and-improvements.md)

## Проблема
Индексация требовала, чтобы воркер читал путь **на машине сервера** (`repository.root`) — для
удалённого хостинга это значит монтирование или git. Как у VEXP, всё должно работать **без git**:
расширение знает открытую папку и может прочитать файлы; git — опционален (для отслеживания
изменений). Нужно индексировать **из переданного контента файлов**, а не из пути на сервере.

## Решение (грамотно, по существующей архитектуре)
Индексатор уже умеет строить индекс из памяти: `RepositoryIndexer.indexFiles(root, [{path,content}])`,
а `IngestionService.ingestIndex(index, …)` эмбеддит готовый индекс (создаёт коллекцию, upsert по
детерминированным id — повторная загрузка перезаписывает). Значит сервер может индексировать из
**загруженных файлов** без диска/git.

### Сервер (API)
- `IndexingService` (`apps/api/src/indexing/`): `indexFiles(projectId, repoAlias, repositoryId, files)`
  → `indexer.indexFiles` (фильтр `.tsx?`, без `.d.ts`/тестов) → `ingestion.ingestIndex` (Qdrant) →
  `symbols.persist` (Postgres). Те же выходы, что у воркера, но on-demand из payload.
- `POST /api/v1/projects/:projectId/repositories/:id/index` (owner-scoped через `RepositoriesService`),
  тело `{ files: [{path, content}] }` (≤10000 файлов, ≤2 МБ на файл). Лимит JSON-тела поднят до 50 МБ
  (`app.useBodyParser('json', { limit })`). Коллекция = `COLLECTION ?? CODE_COLLECTION` (как у MCP).

### Расширение
- `collectWorkspaceFiles()` — читает `**/*.{ts,tsx}` открытой папки (`vscode.workspace.fs`), исключает
  `node_modules/dist/.git/...` и `.d.ts`, кап 512 КБ/файл, ≤5000 файлов.
- `BrainDockClient.indexFiles()`; `ensureWorkspaceProject` теперь **загружает** файлы (а не ставит
  reindex по пути). «Force Re-index» = повторный сбор+загрузка открытой папки.

## Проверено (вживую, без git)
Прочитал 61 `.ts` с диска → `POST /index` → отчёт `{files:61, chunks:80, symbols:80}`; затем MCP
`summarize_project` = 80 символов/58 файлов с ролями, `generate_context` отдаёт контекст. `bun run ci`
зелёный.

## Ограничения / дальше
- ts-парсинг идёт **синхронно в запросе** (для больших монорепо лучше очередь с передачей файлов).
- Удалённые файлы оставляют устаревшие векторы (нет `previous`-диффа) — символы заменяются целиком;
  инкрементальная загрузка (хэши + удаление) — следующий шаг. Git остаётся опциональным (для
  change-coupling/истории).

## Definition of Done
- Индексация работает из загруженных файлов, без git и без пути на сервере; MCP сразу видит данные.
  `bun run ci` зелёный.
