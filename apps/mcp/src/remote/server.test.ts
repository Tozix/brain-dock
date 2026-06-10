import { describe, expect, it } from 'bun:test';
import { createRemoteMcpHandler, type RemoteMcpOptions } from './server';
import type { RemoteServices } from './services';

const BASE = 'http://mcp.test';

type FakeKey = {
  id: string;
  userId: string;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  rateLimit: number | null;
  user: { id: string; email: string; role: string; isActive: boolean };
};

const user = { id: 'u1', email: 'u@x.io', role: 'USER', isActive: true };
const activeKey: FakeKey = {
  id: 'k1',
  userId: 'u1',
  status: 'ACTIVE',
  expiresAt: null,
  lastUsedAt: new Date(), // fresh → resolveUser skips the lastUsedAt update
  rateLimit: null,
  user,
};

/** Minimal RemoteServices double: only what the request path (auth + list_projects) touches. */
function fakeServices(opts: { key?: FakeKey | null; hangProjects?: boolean } = {}): RemoteServices {
  // One known project (slug "demo", owned by u1) with a pinned profile — lets tests verify
  // that the /mcp/{slug} URL segment actually selected it (via get_project_profile).
  const demo = { id: 'p1', slug: 'demo', name: 'Demo', ownerId: 'u1', profile: 'PROFILE' };
  const prisma = {
    apiKey: {
      findUnique: async () => opts.key ?? null,
      update: async () => ({}),
    },
    project: {
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.slug === demo.slug || where.id === demo.id ? demo : null,
      findMany: () =>
        opts.hangProjects
          ? new Promise(() => {}) // never settles — simulates a hung handler
          : Promise.resolve([{ id: 'p1', slug: 'demo', name: 'Demo' }]),
    },
  };
  return {
    prisma,
    usage: { record: async () => {} },
    collection: 'code',
  } as unknown as RemoteServices;
}

function handler(services: RemoteServices, opts: RemoteMcpOptions = {}) {
  return createRemoteMcpHandler(services, opts);
}

const CALL_LIST_PROJECTS = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'list_projects', arguments: {} },
});

const CALL_GET_PROFILE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'get_project_profile', arguments: {} },
});

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  },
});

function postTo(
  path: string,
  headers: Record<string, string> = {},
  body: string = CALL_LIST_PROJECTS,
): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body,
  });
}

function post(headers: Record<string, string> = {}, body: string = CALL_LIST_PROJECTS): Request {
  return postTo('/mcp', headers, body);
}

async function firstText(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
  return body.result?.content?.[0]?.text;
}

const auth = { authorization: 'Bearer bd_test' };

describe('createRemoteMcpHandler', () => {
  it('serves /health and 404s unknown paths', async () => {
    const handle = handler(fakeServices());
    expect((await handle(new Request(`${BASE}/health`))).status).toBe(200);
    expect((await handle(new Request(`${BASE}/nope`))).status).toBe(404);
  });

  it('answers 405 with Allow: POST for GET and DELETE on /mcp', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    for (const method of ['GET', 'DELETE']) {
      const res = await handle(new Request(`${BASE}/mcp`, { method }));
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });

  it('rejects missing and invalid API keys with 401', async () => {
    const handle = handler(fakeServices({ key: null }));
    expect((await handle(post())).status).toBe(401); // no key at all
    expect((await handle(post(auth))).status).toBe(401); // key not in DB
  });

  it('rejects oversized bodies with 413 before auth', async () => {
    const handle = handler(fakeServices({ key: null }), { maxBodyBytes: 10 });
    const res = await handle(post({ ...auth, 'content-length': '11' }, 'x'.repeat(11)));
    expect(res.status).toBe(413);
  });

  it('enforces the per-key rate limit with retry-after', async () => {
    const handle = handler(fakeServices({ key: activeKey }), { rateLimitMax: 2 });
    expect((await handle(post(auth))).status).not.toBe(429);
    expect((await handle(post(auth))).status).not.toBe(429);
    const third = await handle(post(auth));
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('prefers the key own rateLimit over the server default', async () => {
    const limited = { ...activeKey, rateLimit: 1 };
    const handle = handler(fakeServices({ key: limited }), { rateLimitMax: 100 });
    expect((await handle(post(auth))).status).not.toBe(429);
    expect((await handle(post(auth))).status).toBe(429);
  });

  it('rate-limits unauthenticated callers per IP before touching the DB', async () => {
    const handle = handler(fakeServices({ key: null }), { ipRateLimitMax: 2 });
    const ip = { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' };
    expect((await handle(post(ip))).status).toBe(401);
    expect((await handle(post(ip))).status).toBe(401);
    expect((await handle(post(ip))).status).toBe(429); // third hit from the same IP
    // A different source IP is unaffected.
    expect((await handle(post({ 'x-forwarded-for': '8.8.8.8' }))).status).toBe(401);
  });

  it('uses the socket address when X-Forwarded-For is absent', async () => {
    const handle = handler(fakeServices({ key: null }), { ipRateLimitMax: 1 });
    expect((await handle(post(), '1.1.1.1')).status).toBe(401);
    expect((await handle(post(), '1.1.1.1')).status).toBe(429);
    expect((await handle(post(), '2.2.2.2')).status).toBe(401);
  });

  it('rejects an unknown X-Project with 403', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(post({ ...auth, 'x-project': 'ghost' }));
    expect(res.status).toBe(403);
  });

  it('selects the project from the /mcp/{slug} URL segment', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(postTo('/mcp/demo', auth, CALL_GET_PROFILE));
    expect(res.status).toBe(200);
    expect(await firstText(res)).toBe('PROFILE');
  });

  it('rejects an unknown URL slug with a clear 403', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(postTo('/mcp/ghost', auth));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain('ghost');
  });

  it('the URL segment takes precedence over the X-Project header', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(
      postTo('/mcp/demo', { ...auth, 'x-project': 'ghost' }, CALL_GET_PROFILE),
    );
    expect(res.status).toBe(200);
    expect(await firstText(res)).toBe('PROFILE');
  });

  it('plain /mcp without a segment still works (no project selected)', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(post(auth, CALL_GET_PROFILE));
    expect(res.status).toBe(200);
    expect(await firstText(res)).toContain('No project selected');
  });

  it('answers 405 for non-POST on /mcp/{slug} and 404 for deeper paths', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const get = await handle(new Request(`${BASE}/mcp/demo`, { method: 'GET' }));
    expect(get.status).toBe(405);
    const deep = await handle(postTo('/mcp/demo/extra', auth));
    expect(deep.status).toBe(404);
  });

  it('advertises server instructions in the initialize response', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(post(auth, INITIALIZE));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { instructions?: string } };
    expect(body.result?.instructions).toContain('list_projects');
    expect(body.result?.instructions).toContain('/mcp/{slug}');
  });

  it('answers 504 when a tool handler hangs past the deadline', async () => {
    const handle = handler(fakeServices({ key: activeKey, hangProjects: true }), {
      requestTimeoutMs: 50,
    });
    const res = await handle(post(auth));
    expect(res.status).toBe(504);
  });

  it('handles a tools/call end to end with a valid key', async () => {
    const handle = handler(fakeServices({ key: activeKey }));
    const res = await handle(post(auth));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { content?: Array<{ text?: string }> };
    };
    expect(body.result?.content?.[0]?.text).toContain('demo');
  });
});
