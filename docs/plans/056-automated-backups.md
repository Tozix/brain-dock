# 056 — Автоматизированные бэкапы (pg_dump + Qdrant snapshots)

**Status:** Done
**Фаза:** Production / Ops
**Дата:** 2026-06-21
**Связи:** [025](025-deploy-build-on-server.md) · [051](051-audit-closure.md) ·
[backlog ROADMAP](../roadmap/ROADMAP.md#дальше-backlog)

## Цель
Закрыть backlog-пункт «Бэкапы»: дать готовый, надёжный способ регулярно сохранять данные с
сервера и восстанавливаться. Критичен **Postgres** (пользователи, ключи, проекты, память/знания/
документы, символьный индекс) — он невосстановим иначе. Векторы Qdrant восстановимы реиндексом,
но снапшот экономит время/эмбеддинги.

## Scope
- **In:** `scripts/backup.sh` (host-side: `pg_dump` через `docker exec` + Qdrant snapshot API со
  **скачиванием на хост** и ротацией); `scripts/restore.sh` (восстановление Postgres из дампа);
  `bun run backup`; `docs/deployment/BACKUP.md` (использование, cron, restore); правка backup-секции
  deployment README.
- **Out:** off-site/облачная выгрузка (S3/rsync — оставляем на усмотрение оператора, описано как
  «куда дальше»); WAL/PITR; снапшот-том в compose.

## Решения
- **Host-скрипт, не контейнер.** Деплой — single-server docker-compose; бэкап на хосте через
  `docker exec` (Postgres) и Qdrant host-порт — самый простой и предсказуемый путь (cron на хосте).
- **Qdrant: создать → СКАЧАТЬ на хост → удалить в контейнере.** Снапшоты Qdrant ложатся в
  `/qdrant/snapshots` внутри контейнера (НЕ на томе `qdrant-data`) — без скачивания они не переживут
  пересоздание контейнера. Поэтому скачиваем в `BACKUP_DIR` и чистим за собой.
- **Postgres — fatal, Qdrant — best-effort.** Падение pg_dump валит бэкап (это главное); недоступный
  Qdrant — предупреждение, не провал (векторы восстановимы реиндексом).
- **Ротация** по числу снимков (`BACKUP_KEEP`, по умолчанию 7).
- **Restore Postgres** — `gunzip | psql` с явным подтверждением (деструктивно); Qdrant-restore —
  документирован (reindex или upload snapshot).
- На сервере **bun не нужен** (всё в Docker): скрипт использует только docker + curl + coreutils;
  JSON Qdrant парсится через `grep`/`sed`, без зависимости от `bun`/`jq`.

## Этапы
- [x] `scripts/backup.sh`: `.env`-load, pg_dump→gzip, Qdrant per-collection snapshot→download→cleanup,
      ротация, итоговый лог.
- [x] `scripts/restore.sh <backup-dir>`: восстановление Postgres из `postgres-*.sql.gz` (подтверждение).
- [x] `package.json`: `"backup": "bash scripts/backup.sh"`.
- [x] `docs/deployment/BACKUP.md` + обновление backup-секции `docs/deployment/README.md` и ссылок.
- [x] `bun run ci` зелёный (скрипты вне сборки; проверка — shell-синтаксис + dry-run прогон).

## Риски
- `pg_dump` версия в контейнере ↔ целевой Postgres: бэкап и restore идут в **тот же** образ
  (`postgres:17-alpine`) — совместимо.
- Большой Qdrant-снапшот → место на диске: ротация + best-effort + возможность отключить
  (`BACKUP_QDRANT=0`).

## Definition of Done
- `bun run backup` создаёт `backups/<ts>/postgres-*.sql.gz` (+ `qdrant/*.snapshot` при доступном
  Qdrant), хранит последние `BACKUP_KEEP`; `scripts/restore.sh` поднимает БД из дампа; cron-пример
  и инструкция восстановления — в BACKUP.md.
