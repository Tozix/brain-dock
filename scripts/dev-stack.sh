#!/usr/bin/env bash
# brain-dock local dev stack — runs API + index worker + remote MCP in ONE terminal.
# Run this in a standalone terminal window so it survives VS Code restarts.
#
#   bun run dev:stack        # or: bash scripts/dev-stack.sh
#
# Prereqs (once): infra up + migrations:
#   bun run infra:up && bun run db:migrate
#
# Stop everything with Ctrl+C.

cd "$(dirname "$0")/.." || exit 1

# Dev ports default to 3100/8080 and intentionally OVERRIDE any API_PORT/MCP_HTTP_PORT from .env
# (which uses a prod-style :3000 that often clashes locally). Capture any pre-run override first.
DEV_API_PORT="${API_PORT:-3100}"
DEV_MCP_PORT="${MCP_HTTP_PORT:-8080}"
set -a
[ -f .env ] && . ./.env
set +a
export EMBEDDER="${EMBEDDER:-deterministic}"
export API_PORT="$DEV_API_PORT"
export MCP_HTTP_PORT="$DEV_MCP_PORT"

echo "brain-dock dev stack — Ctrl+C to stop"
echo "  API → http://localhost:${API_PORT}  (health: /health/ready, REST: /api/v1)"
echo "  MCP → http://localhost:${MCP_HTTP_PORT}/mcp"
echo "  EMBEDDER=${EMBEDDER}"
echo "  (infra must be up: bun run infra:up)"
echo

pids=()
bun --no-addons run apps/api/src/main.ts & pids+=($!)
bun --no-addons run apps/workers/src/index.ts & pids+=($!)
bun run apps/mcp/src/http.ts & pids+=($!)

trap 'echo; echo "stopping brain-dock dev stack…"; kill "${pids[@]}" 2>/dev/null; wait 2>/dev/null; exit 0' INT TERM
wait
