#!/usr/bin/env bash
# brain-dock — restore Postgres from a backup created by scripts/backup.sh.
#
# DESTRUCTIVE: the dump is taken with `pg_dump --clean --if-exists`, so it DROPs and recreates
# objects in the target database. Run against the intended DB only. Qdrant vectors are NOT restored
# here — either reindex repositories, or upload the snapshot via the Qdrant API
# (PUT /collections/{c}/snapshots/recover or POST /collections/{c}/snapshots/upload); see BACKUP.md.
#
# Usage:  bash scripts/restore.sh <backup-dir>        e.g. scripts/restore.sh backups/20260621-101500Z
#         CONFIRM=yes bash scripts/restore.sh <dir>   skip the interactive prompt (for automation)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

dir="${1:-}"
if [ -z "$dir" ] || [ ! -d "$dir" ]; then
  echo "usage: bash scripts/restore.sh <backup-dir>" >&2
  exit 2
fi

PG_CONTAINER="${PG_CONTAINER:-brain-dock-postgres}"
POSTGRES_USER="${POSTGRES_USER:-brain_dock}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-brain_dock}"
POSTGRES_DB="${POSTGRES_DB:-brain_dock}"

dump="$(ls -1 "$dir"/postgres-*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "$dump" ]; then
  echo "[restore] no postgres-*.sql.gz found in $dir" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "[restore] container '$PG_CONTAINER' is not running" >&2
  exit 1
fi

echo "[restore] dump:     $dump"
echo "[restore] target:   $POSTGRES_DB @ $PG_CONTAINER (user $POSTGRES_USER)"
echo "[restore] WARNING:  this DROPs and recreates objects in '$POSTGRES_DB'."
if [ "${CONFIRM:-}" != "yes" ]; then
  read -r -p "[restore] type 'yes' to proceed: " ans
  [ "$ans" = "yes" ] || { echo "[restore] aborted"; exit 1; }
fi

echo "[restore] restoring…"
gunzip -c "$dump" | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "[restore] done. Reindex repositories to rebuild Qdrant vectors if needed."
