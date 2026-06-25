#!/usr/bin/env bash
# brain-dock — backup: pg_dump (critical) + Qdrant snapshots (best-effort), with rotation.
#
# Run on the HOST — talks to containers only via Docker (no infra host ports needed): `docker exec`
# for Postgres, and a throwaway curl container sharing Qdrant's network namespace for snapshots.
# Needs only docker + coreutils (no bun/jq). Schedule via cron — see docs/deployment/BACKUP.md.
# Postgres holds the only non-recomputable data (users, keys, projects, memory/knowledge/documents,
# symbol index); Qdrant vectors are recoverable by reindex, so a Qdrant failure warns, not fails.
#
# Env (overridable; .env in repo root is sourced automatically):
#   BACKUP_DIR        where to write backups        (default <repo>/backups)
#   BACKUP_KEEP       how many snapshots to retain   (default 7)
#   BACKUP_QDRANT     1=also snapshot Qdrant, 0=skip (default 1)
#   PG_CONTAINER      postgres container name        (default brain-dock-postgres)
#   QDRANT_CONTAINER  qdrant container name          (default brain-dock-qdrant)
#   CURL_IMAGE        image used to reach Qdrant     (default curlimages/curl:8.11.1)
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
QDRANT_CONTAINER="${QDRANT_CONTAINER:-brain-dock-qdrant}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.11.1}"

# Reach Qdrant over the Compose network without any host port: run curl in a throwaway container
# that shares the qdrant container's network namespace, so localhost:6333 IS Qdrant. Body goes to
# stdout (forwarded to the host), so downloads can be redirected straight into a host file.
qcurl() { docker run --rm --network "container:${QDRANT_CONTAINER}" "$CURL_IMAGE" "$@"; }

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
  if cols_json="$(qcurl -sf --max-time 10 http://localhost:6333/collections 2>/dev/null)"; then
    # Parse with grep/sed only (no bun/jq). Qdrant's JSON is flat enough: collection names are the
    # only "name" fields in /collections, and a snapshot-create response carries one "name".
    cols="$(printf '%s' "$cols_json" | grep -oE '"name":"[^"]+"' | sed -E 's/.*:"([^"]+)"/\1/')"
    if [ -n "$cols" ]; then
      mkdir -p "$dest/qdrant"
      for c in $cols; do
        if resp="$(qcurl -sf --max-time 30 -X POST "http://localhost:6333/collections/$c/snapshots" 2>/dev/null)"; then
          snap="$(printf '%s' "$resp" | grep -oE '"name":"[^"]+"' | head -1 | sed -E 's/.*:"([^"]+)"/\1/')"
          if [ -n "$snap" ] && qcurl -sf --max-time 120 \
              "http://localhost:6333/collections/$c/snapshots/$snap" >"$dest/qdrant/$snap" 2>/dev/null; then
            echo "[backup] qdrant '$c': $(du -h "$dest/qdrant/$snap" | cut -f1)"
            # Remove the in-container snapshot so /qdrant/snapshots does not grow unbounded.
            qcurl -sf --max-time 10 -X DELETE \
              "http://localhost:6333/collections/$c/snapshots/$snap" >/dev/null 2>&1 || true
          else
            rm -f "$dest/qdrant/$snap" 2>/dev/null || true
            echo "[backup] WARN: failed to download snapshot for '$c'" >&2
          fi
        else
          echo "[backup] WARN: failed to create snapshot for '$c'" >&2
        fi
      done
    fi
  else
    echo "[backup] WARN: Qdrant unreachable (container '$QDRANT_CONTAINER') — skipping (vectors recoverable by reindex)" >&2
  fi
fi

# --- Rotation: keep the newest BACKUP_KEEP snapshot dirs ---
mapfile -t old < <(ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))")
if [ "${#old[@]}" -gt 0 ]; then
  echo "[backup] rotating: removing ${#old[@]} old snapshot(s) (keep $BACKUP_KEEP)"
  rm -rf "${old[@]}"
fi

echo "[backup] done: $dest"
