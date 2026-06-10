// Hosted-MCP e2e: real Streamable HTTP server + real Postgres (no Qdrant calls — list_projects
// only touches the DB). Gated by RUN_E2E (skipped by the normal `bun test`). Run locally with the
// infra up: RUN_E2E=1 DATABASE_URL=... bun test apps/mcp/src/remote/http.e2e.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler } from './server';
import { buildRemoteServices, type RemoteServices } from './services';

const e2e = process.env.RUN_E2E ? describe : describe.skip;
// Slug-safe (lowercase alphanumeric + dashes) — used in the project slug.
const RUN = `mcp-e2e-${Date.now()}`;
const RAW_KEY = `bd_${RUN}`;

e2e('hosted MCP over Streamable HTTP (real Postgres)', () => {
  let services: RemoteServices;
  let server: ReturnType<typeof Bun.serve>;
  let base: string;
  let userId: string;

  beforeAll(async () => {
    services = buildRemoteServices({
      databaseUrl: process.env.DATABASE_URL ?? '',
      qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:16333',
      collection: `code_${RUN.replace(/-/g, '_')}`,
      embedder: 'deterministic',
      ollamaUrl: 'http://localhost:1',
      embeddingModel: 'x',
    });
    const handle = createRemoteMcpHandler(services);
    server = Bun.serve({ port: 0, fetch: (req, srv) => handle(req, srv.requestIP(req)?.address) });
    base = `http://localhost:${server.port}`;

    const user = await services.prisma.user.create({
      data: { email: `${RUN}@brain.dock`, passwordHash: 'not-a-real-hash' },
    });
    userId = user.id;
    await services.prisma.apiKey.create({
      data: {
        name: 'e2e',
        prefix: RAW_KEY.slice(0, 12),
        keyHash: createHash('sha256').update(RAW_KEY).digest('hex'),
        userId,
      },
    });
    await services.prisma.project.create({ data: { name: 'MCP e2e', slug: RUN, ownerId: userId } });
  });

  afterAll(async () => {
    // User delete cascades to api keys and projects.
    await services.prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await services.prisma.$disconnect();
    server.stop(true);
  });

  it('rejects requests without an API key', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
  });

  it('answers 405 (Allow: POST) on GET so clients do not reconnect-loop', async () => {
    const res = await fetch(`${base}/mcp`, {
      headers: { authorization: `Bearer ${RAW_KEY}` },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('initialize → tools/list → tools/call list_projects works end to end', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: {
        headers: { authorization: `Bearer ${RAW_KEY}`, 'x-project': RUN },
      },
    });
    const client = new Client({ name: 'e2e', version: '0.0.0' });
    await client.connect(transport); // initialize handshake over HTTP

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['list_projects', 'search_code', 'find_symbol']),
    );

    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? '';
    expect(text).toContain(RUN);

    await client.close();
  });
});
