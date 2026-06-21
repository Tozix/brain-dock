# Бэкапы и восстановление

Регулярное сохранение данных сервера. Критичен **Postgres** — единственное невосстановимое
хранилище (пользователи, API-ключи, проекты, репозитории, память/знания/документы, символьный
индекс `CodeSymbol`/`CodeEdge`, usage, audit). Векторы **Qdrant** восстановимы реиндексом, но
снапшот экономит время и эмбеддинги. План: [056](../plans/056-automated-backups.md).

## Что делает `scripts/backup.sh`
Запускается **на хосте** (использует `docker exec` для Postgres и host-порт Qdrant):
1. **Postgres** (обязательно): `pg_dump --clean --if-exists` → `backups/<ts>/postgres-<db>.sql.gz`.
   Падение — фатально (это главная часть бэкапа).
2. **Qdrant** (best-effort): для каждой коллекции создаёт снапшот через API, **скачивает** его на
   хост (`backups/<ts>/qdrant/*.snapshot`) и удаляет копию внутри контейнера. Снапшоты Qdrant лежат
   в `/qdrant/snapshots` (не на томе `qdrant-data`) — без скачивания они бы не пережили пересоздание
   контейнера. Недоступный Qdrant — предупреждение, не провал.
3. **Ротация**: хранит последние `BACKUP_KEEP` снимков (по умолчанию 7), старые удаляет.

```bash
bash scripts/backup.sh          # на сервере; `bun run backup` — локальный алиас того же скрипта
```

> На сервере нужны только **docker + curl + coreutils** (bun/jq **не** требуются — JSON Qdrant
> парсится через `grep`/`sed`).

### Переменные окружения
| Переменная | По умолчанию | Назначение |
|---|---|---|
| `BACKUP_DIR` | `<repo>/backups` | Куда писать (в `.gitignore`). |
| `BACKUP_KEEP` | `7` | Сколько последних снимков хранить. |
| `BACKUP_QDRANT` | `1` | `0` — не трогать Qdrant (только Postgres). |
| `PG_CONTAINER` | `brain-dock-postgres` | Имя контейнера Postgres. |
| `QDRANT_URL` | `http://localhost:16333` | Qdrant host-порт (in-network DNS `qdrant:6333` авто-заменяется). |
| `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` | `brain_dock` | Берутся из `.env`. |

> `.env` из корня репозитория подхватывается автоматически (`POSTGRES_*`).

## Расписание (cron)
Ежедневно в 03:30, лог в файл:
```cron
30 3 * * *  cd /opt/brain-dock && /usr/bin/bash scripts/backup.sh >> /var/log/brain-dock-backup.log 2>&1
```
(или systemd timer). Рекомендуется дополнительно **выгружать `backups/` off-site** (rsync/S3/rclone)
— бэкап на том же сервере не спасает от потери самого сервера.

## Восстановление Postgres
```bash
bash scripts/restore.sh backups/<ts>            # спросит подтверждение (деструктивно)
CONFIRM=yes bash scripts/restore.sh backups/<ts> # без вопроса (автоматизация)
```
Дамп снят с `--clean --if-exists`, поэтому объекты пересоздаются. Версия Postgres в бэкапе и при
восстановлении одна (`postgres:17-alpine`) — совместимо.

## Восстановление Qdrant (при необходимости)
Векторы проще **переиндексировать** (`trigger_reindex` / `POST …/repositories/:id/reindex` или
upload-индексация) — индекс соберётся заново из исходников/символов. Если нужен именно снапшот,
загрузите скачанный файл обратно через Qdrant API:
```bash
# вариант upload (multipart):
curl -X POST "http://localhost:16333/collections/<name>/snapshots/upload?priority=snapshot" \
  -H "content-type: multipart/form-data" -F "snapshot=@backups/<ts>/qdrant/<file>.snapshot"
```
(или `PUT /collections/<name>/snapshots/recover` с `location: file:///qdrant/snapshots/<file>`,
предварительно положив файл в `/qdrant/snapshots` контейнера). Детали API снапшотов — в докуметации Qdrant.

## Проверка бэкапа (рекомендуется периодически)
Восстановите дамп в **отдельную** БД/контейнер и убедитесь, что данные на месте — бэкап, который
ни разу не восстанавливали, нельзя считать рабочим.
