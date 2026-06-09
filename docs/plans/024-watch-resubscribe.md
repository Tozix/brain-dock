# 024 — Горячее переподнятие watcher'ов

**Status:** Done
**Фаза:** Backlog (Multi-Project / Multi-Repository)
**Связи:** [017-multi-repo-watch](017-multi-repo-watch.md)

## Goal
`watch-all` берёт набор репозиториев снимком при старте. Добавить **опциональный поллинг** БД,
чтобы добавленные/удалённые/изменённые репозитории подхватывались без перезапуска воркера.

## Подход
Чистая функция реконсиляции `reconcileWatchTargets(desired, active)` → `{toStart, toStop, toRestart}`
(ключ — `repositoryId`; изменение `rootDir`/`repo`/`collection` → restart). Цикл поллинга в
`watch-all.ts` применяет diff к карте активных watcher'ов. Интервал — `WATCH_POLL_MS` (0 = выкл,
прежнее поведение-снимок).

## Scope
**In:**
- `reconcileWatchTargets` (+ тип `WatcherDiff`) в `watch-targets.ts` + unit-тесты.
- Рефактор `watch-all.ts`: карта `repositoryId → {target, handle}`, `apply(diff)`, опц. `setInterval`.

**Out:** события БД (LISTEN/NOTIFY) вместо поллинга; дебаунс пересборки набора.

## Этапы
- [x] `reconcileWatchTargets` + тесты (add/remove/change/unchanged).
- [x] Поллинг-цикл в `watch-all.ts` (`WATCH_POLL_MS`).
- [x] Docs (Claude.md/план) + CI + commit/push.

## Definition of Done
- `reconcileWatchTargets` корректно классифицирует изменения набора; покрыта тестами.
- `watch-all` с `WATCH_POLL_MS>0` стартует/останавливает/перезапускает watcher'ы по изменениям в БД.
- `bun run ci` зелёный; документация обновлена.
</content>
