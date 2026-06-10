#!/usr/bin/env bun
// Hosted MCP over Streamable HTTP. Users connect their MCP client to this endpoint with their API
// key (Authorization: Bearer bd_…) and select a project via the X-Project header or the
// /mcp/{project-slug} URL — nothing runs on the user's machine.
// Usage: DATABASE_URL=… QDRANT_URL=… [MCP_HTTP_PORT=8080] bun apps/mcp/src/http.ts
import { initTracing, tracingOptionsFromEnv } from '@brain-dock/core';
import { createRemoteMcpHandler } from './remote/server';
import { buildRemoteServices, loadRemoteConfig } from './remote/services';

/** Parse a positive-number env var; refuse to boot on garbage instead of silently misbehaving. */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[mcp:http] invalid ${name}="${raw}" — expected a positive number`);
    process.exit(1);
  }
  return value;
}

if (initTracing(tracingOptionsFromEnv('brain-dock-mcp'))) {
  console.error(`[mcp:http] tracing enabled (exporter: ${process.env.OTEL_TRACES_EXPORTER})`);
}

const services = buildRemoteServices(loadRemoteConfig());
const handle = createRemoteMcpHandler(services, {
  rateLimitMax: envNumber('MCP_RATE_LIMIT_MAX', 600),
  rateLimitWindowMs: envNumber('MCP_RATE_LIMIT_WINDOW_MS', 60_000),
  ipRateLimitMax: envNumber('MCP_IP_RATE_LIMIT', 120),
  maxBodyBytes: envNumber('MCP_MAX_BODY_BYTES', 4_000_000),
  requestTimeoutMs: envNumber('MCP_REQUEST_TIMEOUT_MS', 60_000),
});
const port = envNumber('MCP_HTTP_PORT', 8080);

const server = Bun.serve({
  port,
  idleTimeout: 120,
  fetch: (req, srv) =>
    handle(req, srv.requestIP(req)?.address).catch((error) => {
      console.error('[mcp:http] error:', error);
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }),
});

console.error(`[brain-dock:mcp-http] listening on http://0.0.0.0:${port}/mcp`);

// Graceful shutdown: stop accepting connections, drain in-flight requests, close the DB pool.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[mcp:http] ${signal} received — shutting down`);
  await server.stop();
  await services.prisma.$disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
