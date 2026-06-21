#!/usr/bin/env bash
# brain-dock — backup: pg_dump (critical) + Qdrant snapshots (best-effort), with rotation.
#
# Run on the HOST (uses `docker exec` for Postgres and the Qdrant host port). Schedule via cron —
# see docs/deployment/BACKUP.md. Postgres holds the only non-recomputable data (users, keys,
# projects, memory/knowledge/documents, symbol index); Qdrant vectors are also recoverable by
# reindex, so a Qdrant failure warns but does not fail the run.
#
# Env (overridable; .env in repo root is sourced automatically):
#   BACKUP_DIR     where to write backups        (default <repo>/backups)
#   BACKUP_KEEP    how many snapshots to retain   (default 7)
#   BACKUP_QDRANT  1=also snapshot Qdrant, 0=skip (default 1)
#   PG_CONTAINER   postgres container name        (default brain-dock-postgres)
#   QDRANT_URL     Qdrant base URL (host port)    (default http://localhost:16333)
#   POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB  (default brain_dock, from .env)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Load .env for POSTGRES_* (and QDRANT_URL if customised). Does not override already-set env.
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
BACKUP_QDRANT="${BACKUP_QDRANT:-1}"
PG_CONTAINER="${PG_CONTAINER:-brain-dock-postgres}"
POSTGRES_USER="${POSTGRES_USER:-brain_dock}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-brain_dock}"
POSTGRES_DB="${POSTGRES_DB:-brain_dock}"
# .env QDRANT_URL points at the in-network or host URL; for a host-side backup we need the host
# port (compose binds 127.0.0.1:16333). Fall back to that if QDRANT_URL is the in-network DNS.
QDRANT_URL="${QDRANT_URL:-http://localhost:16333}"
case "$QDRANT_URL" in
  *qdrant:6333*) QDRANT_URL="http://localhost:16333" ;; # in-network DNS won't resolve on the host
esac

ts="$(date -u +%Y%m%d-%H%M%SZ)"
dest="$BACKUP_DIR/$ts"
mkdir -p "$dest"
echo "[backup] target: $dest"

# --- Postgres (critical) ---
if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "[backup] FATAL: container '$PG_CONTAINER' is not running" >&2
  rmdir "$dest" 2>/dev/null || true
  exit 1
fi
echo "[backup] pg_dump '$POSTGRES_DB' from '$PG_CONTAINER'…"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 >"$dest/postgres-$POSTGRES_DB.sql.gz"
echo "[backup] postgres: $(du -h "$dest/postgres-$POSTGRES_DB.sql.gz" | cut -f1)"

# --- Qdrant (best-effort: create snapshot → download to host → delete in-container) ---
if [ "$BACKUP_QDRANT" = "1" ]; then
  if cols_json="$(curl -sf --max-time 10 "$QDRANT_URL/collections" 2>/dev/null)"; then
    cols="$(BD_JSON="$cols_json" bun -e \
      'const j=JSON.parse(process.env.BD_JSON);process.stdout.write((j.result?.collections??[]).map(c=>c.name).join(" "))')"
    if [ -n "$cols" ]; then
      mkdir -p "$dest/qdrant"
      for c in $cols; do
        if resp="$(curl -sf --max-time 30 -X POST "$QDRANT_URL/collections/$c/snapshots" 2>/dev/null)"; then
          snap="$(BD_JSON="$resp" bun -e \
            'const j=JSON.parse(process.env.BD_JSON);process.stdout.write(j.result?.name??"")')"
          if [ -n "$snap" ] && curl -sf --max-time 120 \
              "$QDRANT_URL/collections/$c/snapshots/$snap" -o "$dest/qdrant/$snap" 2>/dev/null; then
            echo "[backup] qdrant '$c': $(du -h "$dest/qdrant/$snap" | cut -f1)"
            # Remove the in-container snapshot so /qdrant/snapshots does not grow unbounded.
            curl -sf --max-time 10 -X DELETE \
              "$QDRANT_URL/collections/$c/snapshots/$snap" >/dev/null 2>&1 || true
          else
            echo "[backup] WARN: failed to download snapshot for '$c'" >&2
          fi
        else
          echo "[backup] WARN: failed to create snapshot for '$c'" >&2
        fi
      done
    fi
  else
    echo "[backup] WARN: Qdrant unreachable at $QDRANT_URL — skipping (vectors recoverable by reindex)" >&2
  fi
fi

# --- Rotation: keep the newest BACKUP_KEEP snapshot dirs ---
mapfile -t old < <(ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))")
if [ "${#old[@]}" -gt 0 ]; then
  echo "[backup] rotating: removing ${#old[@]} old snapshot(s) (keep $BACKUP_KEEP)"
  rm -rf "${old[@]}"
fi

echo "[backup] done: $dest"
