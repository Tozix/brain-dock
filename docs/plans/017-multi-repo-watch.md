# 017 — Мульти-репо watch-воркер

**Status:** Done
**Фаза:** Backlog (Multi-Project / Multi-Repository)
**Связи:** [012-incremental-watch](012-incremental-watch.md) · [015-multi-repo](015-multi-repo.md) · [016-multi-repo-rest](016-multi-repo-rest.md)

## Goal
Завершить multi-repo: watch-воркер должен следить **за всеми репозиториями проекта** (из БД),
инкрементально переиндексируя каждый с правильными `repo` (alias) + `repositoryId`, а не за
единственным `PROJECT_ROOT`.

## Scope
**In:**
- `WatchOptions` дополняется `repo?` + `repositoryId?`; проброс в `ingestIncremental`.
- Чистая функция `repositoriesToWatchTargets(repos)` (DB-строки `Repository` → watch-таргеты);
  покрыта unit-тестом.
- Новый воркер-entry `watch-all.ts`: читает `Repository` из Postgres (опц. scope по `PROJECT_ID`),
  поднимает по watcher'у на каждый репо. `@brain-dock/db` добавляется в зависимости workers.

**Out:**
- Горячее переподнятие watcher'ов при изменении набора репо в БД (нужен поллинг/события) — снимок при старте.
- Кросс-репо граф; авто-обнаружение репо.

## Этапы
- [x] `WatchOptions.repo`/`repositoryId` + проброс в `ingestIncremental`.
- [x] `watch-targets.ts` (+ unit-тест `repositoriesToWatchTargets`).
- [x] `watch-all.ts` (entry: Postgres → таргеты → по watcher'у на репо).
- [x] workers deps (`@brain-dock/db`); docs (roadmap/Claude.md/backend); CI + commit/push.

## Риски
- fs.watch/таймеры трудно тестировать детерминированно → тестируем чистый маппинг, не сам watcher.
- Снимок набора репо берётся при старте; новые репо подхватятся после перезапуска воркера (задокументировано).

## Definition of Done
- ✅ `watch-all` инкрементально реиндексирует репо проекта (из БД) с `repo`+`repositoryId`.
  Проверено вживую: initial `chunks=1` → правка файла → incremental `chunks=2`.
- ✅ `repositoriesToWatchTargets` покрыта тестом; `bun run ci` зелёный (81 тест); docs обновлены.

## Запуск
`DATABASE_URL=… [PROJECT_ID=…] EMBEDDER=ollama bun --no-addons apps/workers/src/watch-all.ts`
(`PROJECT_ID` опционален — без него следит за всеми репо всех проектов; набор — снимок при старте).
</content>
