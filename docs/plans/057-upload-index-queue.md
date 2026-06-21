# 057 — Очередь для upload-индексации

**Status:** Done
**Фаза:** Production / Indexing
**Дата:** 2026-06-21
**Связи:** [016](016-multi-repo-rest.md) (BullMQ producer/port) · [046](046-index-uploaded-files-no-git.md)
(upload-индексация) · [053](053-mcp-ux.md) (статусы `Repository.indexStatus`) ·
[backlog ROADMAP](../roadmap/ROADMAP.md#дальше-backlog)

## Проблема
`POST /projects/:pid/repositories/:id/index` индексировал **синхронно в HTTP-запросе**: парсинг
ts-morph + эмбеддинги (Ollama) могли идти десятки секунд → крупная загрузка рисковала упереться в
таймаут nginx (300с) и держала event-loop API. Теперь эндпоинт ставит задачу и сразу отвечает
`202`, а индексирует фоновый воркер (как уже сделано для server-path `reindex`).

## Выбранный подход (развилка №1 — доставка байтов воркеру): **B — общий том + path-индексация**
Воркер уже индексирует **из пути** (`indexer.index(rootDir)`). API пишет загруженные файлы во
временный каталог на **томе, общем для `api` и `workers`**; задача `IndexJob{kind:'upload'}` несёт
путь; воркер индексирует тем же путём, что и server-path, и **удаляет** каталог в `finally`.
Максимум переиспользования, Redis лёгкий, крупные загрузки на диске.

Отвергнуты: **A** (файлы в payload BullMQ → давление на память Redis), **C** (стейджинг-таблица в
Postgres → новая таблица/миграция, blob'ы в БД, больше кода).

## Контракт (развилка №2)
Ответ стал асинхронным: `202` + `{ repositoryId, status: 'QUEUED' }` вместо
`{ files, chunks, symbols }`. Клиенты опрашивают `GET …/repositories/:id/status`
(QUEUED/INDEXING/READY/FAILED — инфраструктура статусов из плана 053).

## Реализация
- **`@brain-dock/core`**: `IndexJob.kind?: 'reindex' | 'upload'`.
- **Продюсер** (`bull-index-queue.ts`): upload-задачи enqueue'ятся с `attempts: 1` +
  `removeOnComplete: true` (байты эфемерны: ретрай не нужен и небезопасен после удаления каталога;
  большой файл-три не оседает в Redis). Server-path сохраняет retry/backoff.
- **Воркер** (`process-index-job.ts`): после job при `kind==='upload'` удаляет `rootDir`
  (`rm recursive,force`) в `finally` — безопасно, т.к. ретраев нет.
- **`IndexingService`** переписан в тонкий «stage + enqueue»: бюджет-чек → запись файлов в
  `<INDEX_STAGING_DIR>/<repoId>-<uuid>` с **санитайзом путей** (любой `..`/absolute, выходящий за
  каталог, пропускается) → stamp `QUEUED` → `enqueue({kind:'upload', rootDir, …})`; на ошибке
  enqueue каталог удаляется. Вся индексация (парсинг/эмбеддинги/символы) теперь только в воркере.
- **Контроллер**: `@HttpCode(202)`, `enqueueUpload(...)`.
- **DI**: `RepositoriesModule` экспортирует `INDEX_QUEUE_PORT`; `IndexingService` его инжектит
  (один инстанс очереди на оба пути).
- **env**: `INDEX_STAGING_DIR` (default `os.tmpdir()/brain-dock-index-staging`).
- **compose**: том `index-staging`, смонтирован в `api` (+`INDEX_STAGING_DIR=/var/lib/brain-dock/staging`)
  и `workers`; Dockerfile'ы создают+`chown bun` каталог до `USER bun`, чтобы named volume
  унаследовал владельца (контейнеры под non-root `bun`).
- **Клиенты**: расширение (`client.indexFiles` → POST 202 → опрос `getRepoStatus` до READY/FAILED,
  лог по статусу; i18n `progress.indexing`) и web (`project.tsx` — 202 + существующий 5-сек опрос
  статуса показывает прогресс/счётчики).
- **Тесты**: `indexing.service.test.ts` переписан (staging-запись, санитайз, QUEUED, payload
  очереди, очистка при ошибке enqueue); `process-index-job.test.ts` +2 (удаление staging на
  успехе/ошибке). `bun run ci` зелёный (380 pass).

## Риски / известные ограничения
- Если воркер **никогда** не подхватит задачу (долго лежит/упал), staging-каталог осиротеет.
  Ограничен бюджетом загрузки; периодическая чистка старых каталогов — возможное будущее улучшение.
- Path-traversal закрыт санитайзом; права на общий том решены chown в Dockerfile.

## Definition of Done
- Upload-эндпоинт ставит задачу и отвечает `202 QUEUED`; воркер индексирует загруженные файлы
  (символы→Postgres, векторы→Qdrant) и удаляет staging; статус доходит до READY/FAILED; web и
  расширение показывают прогресс по статусу; `bun run ci` зелёный.
