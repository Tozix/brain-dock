# 012 — Incremental watch-reindex

- **Status:** Done
- **Phase:** 8 (backlog — ingestion)
- **Связи:** [002-indexer](002-indexer.md) · [003-rag-engine](003-rag-engine.md)

## Goal
Инкрементальный реиндекс: переэмбеддить только изменённые файлы, удалять векторы изменённых/удалённых;
авто-реиндекс по файловым событиям (watch).

## Сделано
- `IngestionService.ingestIncremental(rootDir, { previous })`: использует хэш-инкрементальность
  индексатора; для изменённого файла — `deleteByFilter(path)` + re-embed; для удалённого — `deleteByFilter`.
  Возвращает `{ files, changedFiles, removedFiles, chunks, index }` (index → `previous` для след. прогона).
  Рефакторинг: общий `embedFile` (используется и в полном `ingestIndex`).
- `QdrantStore.deleteByFilter` для удаления точек по `path`.
- `apps/workers`: `startWatchReindexer` (`fs.watch` recursive + debounce, сериализованный прогон) +
  entry `apps/workers/src/watch.ts` (`PROJECT_ROOT`/`EMBEDDER`/...).

## Проверено вживую
- Unit: первый прогон эмбеддит все файлы; после изменения одного — `changedFiles=1` и upsert только его;
  после удаления файла — `removedFiles=1` + delete по path.
- Live (temp-dir + Qdrant): watcher делает начальный реиндекс, затем при создании файла — повторный
  инкрементальный (changed=1).

## Далее
- Watch по нескольким репо; учёт move/rename; интеграция с BullMQ (события → очередь index).
