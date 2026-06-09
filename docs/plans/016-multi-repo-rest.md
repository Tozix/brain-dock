# 016 — Multi-Repo: Prisma, REST CRUD и индексация через очереди

**Status:** Draft
**Фаза:** Backlog (Multi-Project / Multi-Repository)
**Связи:** [015-multi-repo](015-multi-repo.md) · [006-multiproject-rest-hardening](006-multiproject-rest-hardening.md) · [012-incremental-watch](012-incremental-watch.md)

## Goal
Сделать репозитории **управляемой сущностью**: хранить их в Postgres (source of truth),
управлять через REST, запускать индексацию каждого репо через BullMQ, и привязать векторы
к стабильному `repositoryId` (uuid). Опирается на движок multi-repo из плана [015](015-multi-repo.md).

## Scope
**In:**
- Prisma-модель `Repository` (`id`, `projectId`, `name`, `slug`/`alias`, `root`, `defaultBranch?`,
  таймстемпы; `@@unique([projectId, alias])`) + миграция.
- `repositoryId` (uuid) в `ChunkPayload` рядом с `repo` (alias); реиндекс заполняет оба.
- REST `RepositoriesController` под проектом (owner-scoped): list/create/get/update/delete +
  `POST /projects/:id/repositories/:repoId/reindex` (ставит `IndexJob` в очередь).
- `IndexJob` дополняется `repositoryId`; продьюсер в API, воркер пишет в payload.
- Мульти-репо watch-воркер: следит за всеми репо проекта.

**Out:**
- Кросс-репо граф зависимостей (символы разных репо).
- Авто-обнаружение репо (git submodules / workspace globs).

## Этапы (черновик)
- [ ] Prisma `Repository` + миграция (`add_repositories`); заметка в `docs/database/`.
- [ ] `repositoryId` в payload (`@brain-dock/search`); проброс из ingestion-опций.
- [ ] `RepositoriesModule` (REST CRUD + ownership-guard) поверх Prisma.
- [ ] `IndexJob.repositoryId` + продьюсер очереди в API + воркер.
- [ ] Мульти-репо watch.
- [ ] Тесты (unit + e2e ownership) + docs (api/database/roadmap/Claude.md).

## Риски
- Миграция в продовой БД — обратимость и порядок выкладки (схема → код).
- Рассинхрон alias (engine, план 015) и `repositoryId` (БД): реиндекс должен писать оба согласованно.

## Definition of Done
- Репозитории создаются/удаляются через REST, изолированы по владельцу проекта.
- Индексация репо ставится в очередь и исполняется воркером; векторы несут `repositoryId`+`repo`.
- `bun run ci` зелёный; документация обновлена.
</content>
