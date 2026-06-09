#!/usr/bin/env bash
# brain-dock — REST smoke for Phase 7: projects + project-scoped memory/knowledge + ownership.
# Requires infra up + migrated DB. Usage: PORT=3100 bash scripts/smoke-rest.sh
set -euo pipefail

PORT="${PORT:-3000}"
API="http://127.0.0.1:${PORT}/api/v1"

API_PORT="${PORT}" RATE_LIMIT_MAX="${RATE_LIMIT_MAX:-1000}" EMBEDDER="${EMBEDDER:-deterministic}" \
  bun run apps/api/src/main.ts >/tmp/brain-dock-rest.log 2>&1 &
APIPID=$!
trap 'kill "${APIPID}" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break; sleep 0.5; done

email="rest_$(date +%s)@brain.dock"; slug="rest-$(date +%s)"
access=$(curl -fsS -X POST "${API}/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"${email}\",\"password\":\"supersecret123\"}" \
  | bun -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).accessToken))')

pid=$(curl -fsS -X POST "${API}/projects" -H "authorization: Bearer ${access}" -H 'content-type: application/json' \
  -d "{\"name\":\"Demo\",\"slug\":\"${slug}\"}" \
  | bun -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')
echo "→ project ${pid}"

curl -fsS -X POST "${API}/projects/${pid}/memory" -H "authorization: Bearer ${access}" -H 'content-type: application/json' \
  -d '{"content":"We chose Bun + NestJS (pure Bun).","type":"DECISION","tags":["bun"]}' >/dev/null
echo "→ remembered"
echo "→ search_memory:"; curl -fsS "${API}/projects/${pid}/memory/search?q=bun%20runtime" -H "authorization: Bearer ${access}"
echo; echo "✓ rest smoke OK"
