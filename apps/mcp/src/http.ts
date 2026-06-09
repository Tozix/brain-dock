#!/usr/bin/env bun
// Hosted MCP over Streamable HTTP. Users connect their MCP client to this endpoint with their API
// key (Authorization: Bearer bd_…) and select a project via the X-Project header — nothing runs on
// the user's machine. Usage: DATABASE_URL=… QDRANT_URL=… [MCP_HTTP_PORT=8080] bun apps/mcp/src/http.ts
import { initTracing, tracingOptionsFromEnv } from '@brain-dock/core';
import { createRemoteMcpHandler } from './remote/server';
import { buildRemoteServices, loadRemoteConfig } from './remote/services';

if (initTracing(tracingOptionsFromEnv('brain-dock-mcp'))) {
  console.error(`[mcp:http] tracing enabled (exporter: ${process.env.OTEL_TRACES_EXPORTER})`);
}

const services = buildRemoteServices(loadRemoteConfig());
const handle = createRemoteMcpHandler(services, {
  rateLimitMax: Number(process.env.MCP_RATE_LIMIT_MAX ?? 600),
  rateLimitWindowMs: Number(process.env.MCP_RATE_LIMIT_WINDOW_MS ?? 60_000),
});
const port = Number(process.env.MCP_HTTP_PORT ?? 8080);

Bun.serve({
  port,
  idleTimeout: 120,
  fetch: (req) =>
    handle(req).catch((error) => {
      console.error('[mcp:http] error:', (error as Error).message);
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }),
});

console.error(`[brain-dock:mcp-http] listening on http://0.0.0.0:${port}/mcp`);
