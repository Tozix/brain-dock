import { describe, expect, it } from 'bun:test';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantStore } from './qdrant-store';

function notFound(): Error {
  return Object.assign(new Error('Not found: collection x'), { status: 404 });
}

/** getCollection payload of a legacy collection: one unnamed dense vector. */
function legacyCollection(size = 768) {
  return { config: { params: { vectors: { size } } } };
}

/** getCollection payload of a hybrid collection: named dense + sparse bm25. */
function hybridCollection(size = 768) {
  return {
    config: {
      params: {
        vectors: { dense: { size, distance: 'Cosine' } },
        sparse_vectors: { bm25: { modifier: 'idf' } },
      },
    },
  };
}

interface FakeCalls {
  getCollection: string[];
  createCollection: Array<{ name: string; opts: Record<string, unknown> }>;
  createPayloadIndex: Array<Record<string, unknown>>;
  upsert: unknown[];
  search: Array<Record<string, unknown>>;
  query: Array<Record<string, unknown>>;
  delete: unknown[];
  scroll: Array<Record<string, unknown>>;
}

/** Minimal fake of the Qdrant REST client — each method can be overridden per test. */
function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: FakeCalls = {
    getCollection: [],
    createCollection: [],
    createPayloadIndex: [],
    upsert: [],
    search: [],
    query: [],
    delete: [],
    scroll: [],
  };
  const client = {
    async getCollection(name: string) {
      calls.getCollection.push(name);
      throw notFound();
    },
    async createCollection(name: string, opts: Record<string, unknown>) {
      calls.createCollection.push({ name, opts });
      return true;
    },
    async createPayloadIndex(_name: string, opts: Record<string, unknown>) {
      calls.createPayloadIndex.push(opts);
      return { status: 'acknowledged' };
    },
    async upsert(...args: unknown[]) {
      calls.upsert.push(args);
    },
    async delete(...args: unknown[]) {
      calls.delete.push(args);
    },
    async search(_name: string, opts: Record<string, unknown>) {
      calls.search.push(opts);
      return [];
    },
    async query(_name: string, opts: Record<string, unknown>) {
      calls.query.push(opts);
      return { points: [] };
    },
    async scroll(_name: string, opts: Record<string, unknown>) {
      calls.scroll.push(opts);
      return { points: [], next_page_offset: null };
    },
    ...overrides,
  };
  return { client: client as unknown as QdrantClient, calls };
}

function store(client: QdrantClient): QdrantStore {
  return new QdrantStore({ url: 'http://unused', client });
}

describe('QdrantStore.ensureCollection', () => {
  it('creates new collections in hybrid format: named dense + sparse bm25 with idf', async () => {
    const { client, calls } = fakeClient();
    await store(client).ensureCollection('code', 768);
    expect(calls.createCollection).toEqual([
      {
        name: 'code',
        opts: {
          vectors: { dense: { size: 768, distance: 'Cosine' } },
          sparse_vectors: { bm25: { modifier: 'idf' } },
        },
      },
    ]);
  });

  it('creates keyword payload indexes for projectId (tenant), repo and path', async () => {
    const { client, calls } = fakeClient();
    await store(client).ensureCollection('code', 768);
    expect(calls.createPayloadIndex).toEqual([
      { field_name: 'projectId', field_schema: { type: 'keyword', is_tenant: true }, wait: true },
      { field_name: 'repo', field_schema: { type: 'keyword' }, wait: true },
      { field_name: 'path', field_schema: { type: 'keyword' }, wait: true },
    ]);
  });

  it('swallows "already exists" from createPayloadIndex but propagates real errors', async () => {
    const { client } = fakeClient({
      getCollection: async () => legacyCollection(),
      createPayloadIndex: async () => {
        throw Object.assign(new Error('Index already exists'), { status: 409 });
      },
    });
    await expect(store(client).ensureCollection('code', 768)).resolves.toBeUndefined();

    const { client: broken } = fakeClient({
      getCollection: async () => legacyCollection(),
      createPayloadIndex: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    await expect(store(broken).ensureCollection('code', 768)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('does not create when the collection already exists with a matching size (legacy)', async () => {
    const { client, calls } = fakeClient({ getCollection: async () => legacyCollection() });
    await store(client).ensureCollection('code', 768);
    expect(calls.createCollection).toHaveLength(0);
  });

  it('accepts an existing hybrid collection with a matching dense size', async () => {
    const { client, calls } = fakeClient({ getCollection: async () => hybridCollection() });
    await store(client).ensureCollection('code', 768);
    expect(calls.createCollection).toHaveLength(0);
  });

  it('throws a descriptive error on a vector size mismatch (both formats)', async () => {
    const legacy = fakeClient({ getCollection: async () => legacyCollection(256) });
    await expect(store(legacy.client).ensureCollection('code', 768)).rejects.toThrow(
      /has vector size 256.*needs 768/,
    );
    const hybrid = fakeClient({ getCollection: async () => hybridCollection(256) });
    await expect(store(hybrid.client).ensureCollection('code', 768)).rejects.toThrow(
      /has vector size 256.*needs 768/,
    );
  });

  it('propagates non-404 errors instead of trying to create', async () => {
    const { client, calls } = fakeClient({
      getCollection: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    await expect(store(client).ensureCollection('code', 768)).rejects.toThrow(/ECONNREFUSED/);
    expect(calls.createCollection).toHaveLength(0);
  });

  it('tolerates losing the create race (already exists)', async () => {
    const { client } = fakeClient({
      createCollection: async () => {
        throw Object.assign(new Error('Collection `code` already exists!'), { status: 409 });
      },
    });
    await expect(store(client).ensureCollection('code', 768)).resolves.toBeUndefined();
  });
});

describe('QdrantStore.collectionMode', () => {
  it('detects a legacy collection (single unnamed vector) and caches the answer', async () => {
    const { client, calls } = fakeClient({
      getCollection: async (name: string) => {
        calls.getCollection.push(name);
        return legacyCollection();
      },
    });
    const s = store(client);
    expect(await s.collectionMode('code')).toBe('legacy');
    expect(await s.collectionMode('code')).toBe('legacy');
    expect(calls.getCollection).toHaveLength(1); // cached after the first lookup
  });

  it('detects a hybrid collection (named dense + sparse bm25)', async () => {
    const { client } = fakeClient({ getCollection: async () => hybridCollection() });
    expect(await store(client).collectionMode('code')).toBe('hybrid');
  });

  it('reports legacy for a missing collection without caching', async () => {
    const { client, calls } = fakeClient({
      getCollection: async (name: string) => {
        calls.getCollection.push(name);
        throw notFound();
      },
    });
    const s = store(client);
    expect(await s.collectionMode('code')).toBe('legacy');
    expect(await s.collectionMode('code')).toBe('legacy');
    expect(calls.getCollection).toHaveLength(2); // not cached — may be created later
  });
});

describe('QdrantStore.search', () => {
  it('maps ids to strings and defaults missing payloads to {} (legacy collection)', async () => {
    const { client } = fakeClient({
      search: async () => [
        { id: 42, score: 0.9, payload: null },
        { id: 'uuid-1', score: 0.5, payload: { path: 'a.ts' } },
      ],
    });
    const hits = await store(client).search('code', [0.1]);
    expect(hits).toEqual([
      { id: '42', score: 0.9, payload: {} },
      { id: 'uuid-1', score: 0.5, payload: { path: 'a.ts' } },
    ]);
  });

  it('uses the unnamed vector on legacy and the named dense vector on hybrid collections', async () => {
    const legacy = fakeClient({ getCollection: async () => legacyCollection() });
    await store(legacy.client).search('code', [0.1, 0.2]);
    expect(legacy.calls.search[0]?.vector).toEqual([0.1, 0.2]);

    const hybrid = fakeClient({ getCollection: async () => hybridCollection() });
    await store(hybrid.client).search('code', [0.1, 0.2]);
    expect(hybrid.calls.search[0]?.vector).toEqual({ name: 'dense', vector: [0.1, 0.2] });
  });
});

describe('QdrantStore.upsert', () => {
  const densePoint = { id: 'p1', vector: [0.1, 0.2], payload: { path: 'a.ts' } };
  const sparsePoint = {
    id: 'p2',
    vector: [0.3, 0.4],
    sparse: { indices: [7], values: [1.5] },
    payload: { path: 'b.ts' },
  };

  it('sends named dense (+ bm25 when present) vectors on hybrid collections', async () => {
    const { client, calls } = fakeClient({ getCollection: async () => hybridCollection() });
    await store(client).upsert('code', [densePoint, sparsePoint]);
    const [, body] = calls.upsert[0] as [string, { points: Array<{ vector: unknown }> }];
    expect(body.points[0]?.vector).toEqual({ dense: [0.1, 0.2] });
    expect(body.points[1]?.vector).toEqual({
      dense: [0.3, 0.4],
      bm25: { indices: [7], values: [1.5] },
    });
  });

  it('keeps plain vectors and drops the sparse part on legacy collections', async () => {
    const { client, calls } = fakeClient({ getCollection: async () => legacyCollection() });
    await store(client).upsert('code', [densePoint, sparsePoint]);
    const [, body] = calls.upsert[0] as [
      string,
      { points: Array<{ vector: unknown; sparse?: unknown }> },
    ];
    expect(body.points[0]?.vector).toEqual([0.1, 0.2]);
    expect(body.points[1]?.vector).toEqual([0.3, 0.4]);
    expect(body.points[1]?.sparse).toBeUndefined();
  });
});

describe('QdrantStore.hybridQuery', () => {
  it('sends dense + bm25 prefetches with RRF fusion and maps the response points', async () => {
    const { client, calls } = fakeClient({
      query: async (_name: string, opts: Record<string, unknown>) => {
        calls.query.push(opts);
        return { points: [{ id: 1, score: 0.016, payload: { path: 'a.ts' } }] };
      },
    });
    const filter = { must: [{ key: 'projectId', match: { value: 'p' } }] };
    const hits = await store(client).hybridQuery('code', {
      dense: [0.1],
      sparse: { indices: [42], values: [1] },
      limit: 5,
      prefetchLimit: 15,
      filter,
    });

    expect(hits).toEqual([{ id: '1', score: 0.016, payload: { path: 'a.ts' } }]);
    expect(calls.query[0]).toEqual({
      prefetch: [
        { query: [0.1], using: 'dense', limit: 15, filter },
        { query: { indices: [42], values: [1] }, using: 'bm25', limit: 15, filter },
      ],
      query: { fusion: 'rrf' },
      filter,
      limit: 5,
      with_payload: true,
    });
  });
});

describe('QdrantStore — empty input shortcuts', () => {
  it('upsert with no points does not call the client', async () => {
    const { client, calls } = fakeClient();
    await store(client).upsert('code', []);
    expect(calls.upsert).toHaveLength(0);
  });

  it('deletePoints with no ids does not call the client', async () => {
    const { client, calls } = fakeClient();
    await store(client).deletePoints('code', []);
    expect(calls.delete).toHaveLength(0);
  });
});

describe('QdrantStore.listPointIds', () => {
  it('scrolls all pages following next_page_offset and returns ids as strings', async () => {
    const pages = [
      { points: [{ id: 1 }, { id: 'a' }], next_page_offset: 'b' },
      { points: [{ id: 'b' }], next_page_offset: null },
    ];
    let call = 0;
    const { client, calls } = fakeClient({
      scroll: async (_name: string, opts: Record<string, unknown>) => {
        calls.scroll.push(opts);
        return pages[call++];
      },
    });
    const ids = await store(client).listPointIds('code', {
      filter: { must: [{ key: 'projectId', match: { value: 'p' } }] },
      batchSize: 2,
    });
    expect(ids).toEqual(['1', 'a', 'b']);
    expect(calls.scroll).toHaveLength(2);
    expect(calls.scroll[0]).toMatchObject({
      limit: 2,
      with_payload: false,
      with_vector: false,
    });
    expect(calls.scroll[1]).toMatchObject({ offset: 'b' });
  });
});
