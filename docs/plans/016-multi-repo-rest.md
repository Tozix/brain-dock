# 016 — Multi-Repo: Prisma, REST CRUD и индексация через очереди

**Status:** Done
**Фаза:** Backlog (Multi-Project / Multi-Repository)
**Связи:** [015-multi-repo](015-multi-repo.md) · [006-multiproject-rest-hardening](006-multiproject-rest-hardening.md) · [012-incremental-watch](012-incremental-watch.md)

## Goal
Сделать репозитории **управляемой сущностью**: хранить их в Postgres (source of truth),
управлять через REST, запускать индексацию каждого репо через BullMQ, и привязать векторы
к стабильному `repositoryId` (uuid). Опирается на движок multi-repo из плана [015](015-multi-repo.md).

## Scope
**In:**
- Prisma-модель `Repository` (`id`, `projectId`, `name`, `alias`, `root`, `defaultBranch?`,
  таймстемпы; `@@unique([projectId, alias])`) + миграция.
- `repositoryId` (uuid) в `ChunkPayload` рядом с `repo` (alias); реиндекс заполняет оба.
- REST `RepositoriesController` под проектом (owner-scoped): list/create/get/update(PATCH)/delete +
  `POST /projects/:id/repositories/:repoId/reindex` (ставит `IndexJob` в очередь).
- `IndexJob` дополняется `repositoryId`; продьюсер в API (BullMQ), воркер пишет в payload.
- Контракт очереди (`INDEX_QUEUE`/`IndexJob`/порт `IndexQueue`) вынесен в `@brain-dock/core`.

**Out (→ follow-up):**
- Мульти-репо watch-воркер: следит за всеми репо проекта (требует чтения репо из БД в воркере).
- Кросс-репо граф зависимостей (символы разных репо).
- Авто-обнаружение репо (git submodules / workspace globs).
- Регистрация repositories-эндпоинтов в OpenAPI-документе.

## Этапы
- [x] Контракт очереди в `@brain-dock/core` (`IndexQueue`/`INDEX_QUEUE`/`IndexJob`); workers ре-экспорт.
- [x] `repositoryId` в payload (`@brain-dock/search`); проброс из ingestion-опций; воркер пишет.
- [x] Prisma `Repository` + миграция `add_repositories`.
- [x] `RepositoriesModule` (REST CRUD + reindex) поверх Prisma, ownership через `ProjectsService`.
- [x] `IndexQueue` BullMQ-провайдер (токен развязан от bullmq; `--no-addons` в скриптах API).
- [x] Тесты (`repositories.service`: CRUD/ownership/409/enqueue) + live REST-smoke.
- [x] Docs (api/database/roadmap/Claude.md).

## Риски
- **BullMQ-на-Bun:** msgpackr тянет нативный addon, падающий под Bun. Закрыто: DI-токен
  (`index-queue.ts`) не импортирует bullmq, реализация (`bull-index-queue.ts`) грузится только
  модулем; скрипты API запускаются с `--no-addons` (как workers).
- Рассинхрон alias и `repositoryId`: реиндекс пишет оба из одной строки `Repository`.

## Definition of Done
- ✅ Репозитории создаются/обновляются/удаляются через REST, изолированы по владельцу проекта
  (проверено вживую: 409 на дубль alias, CRUD, reindex → `queued:true`, задача в Redis).
- ✅ Индексация репо ставится в очередь (`IndexJob` с `repo`+`repositoryId`); воркер пишет оба в payload.
- ✅ `bun run ci` зелёный (79 тестов); документация обновлена.
</content>
