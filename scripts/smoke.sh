#!/usr/bin/env bash
# brain-dock — end-to-end smoke test for the API foundation (Phase 1).
# Requires infra up (`bun run infra:up`) and a migrated DB (`bun run db:migrate`).
# The API-key step needs the bootstrap SUPER_ADMIN — i.e. run against a FRESH DB,
# where the first registered user is promoted to SUPER_ADMIN. On a non-empty DB the
# new user is a plain USER and the issue-key call correctly returns 403 (RBAC working).
# Usage: PORT=3100 bash scripts/smoke.sh
set -euo pipefail

PORT="${PORT:-3000}"
BASE="http://127.0.0.1:${PORT}"
API="${BASE}/api/v1"

API_PORT="${PORT}" bun run apps/api/src/main.ts >/tmp/brain-dock-api.log 2>&1 &
APIPID=$!
trap 'kill "${APIPID}" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  curl -fsS "${BASE}/health" >/dev/null 2>&1 && break
  sleep 0.5
done

email="admin_$(date +%s)@brain.dock"
echo "→ health";        curl -fsS "${BASE}/health"
echo; echo "→ ready";   curl -fsS "${BASE}/health/ready"
echo; echo "→ register"; reg=$(curl -fsS -X POST "${API}/auth/register" \
  -H 'content-type: application/json' -d "{\"email\":\"${email}\",\"password\":\"supersecret123\"}")
echo "${reg}"
access=$(printf '%s' "${reg}" | bun -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).accessToken))')
echo "→ me";            curl -fsS "${API}/auth/me" -H "authorization: Bearer ${access}"
echo; echo "→ issue key"; curl -fsS -X POST "${API}/api-keys" -H "authorization: Bearer ${access}" \
  -H 'content-type: application/json' -d '{"name":"smoke-key"}'
echo; echo "✓ smoke OK"
