import { describe, expect, it } from 'bun:test';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantStore } from './qdrant-store';

function notFound(): Error {
  return Object.assign(new Error('Not found: collection x'), { status: 404 });
}

interface FakeCalls {
  getCollection: string[];
  createCollection: Array<{ name: string; size: number }>;
  upsert: unknown[];
  delete: unknown[];
  scroll: Array<Record<string, unknown>>;
}

/** Minimal fake of the Qdrant REST client — each method can be overridden per test. */
function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: FakeCalls = {
    getCollection: [],
    createCollection: [],
    upsert: [],
    delete: [],
    scroll: [],
  };
  const client = {
    async getCollection(name: string) {
      calls.getCollection.push(name);
      throw notFound();
    },
    async createCollection(name: string, opts: { vectors: { size: number } }) {
      calls.createCollection.push({ name, size: opts.vectors.size });
      return true;
    },
    async upsert(...args: unknown[]) {
      calls.upsert.push(args);
    },
    async delete(...args: unknown[]) {
      calls.delete.push(args);
    },
    async search() {
      return [];
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
  it('creates the collection only when getCollection reports 404', async () => {
    const { client, calls } = fakeClient();
    await store(client).ensureCollection('code', 768);
    expect(calls.createCollection).toEqual([{ name: 'code', size: 768 }]);
  });

  it('does not create when the collection already exists with a matching size', async () => {
    const { client, calls } = fakeClient({
      getCollection: async () => ({ config: { params: { vectors: { size: 768 } } } }),
    });
    await store(client).ensureCollection('code', 768);
    expect(calls.createCollection).toHaveLength(0);
  });

  it('throws a descriptive error on a vector size mismatch', async () => {
    const { client, calls } = fakeClient({
      getCollection: async () => ({ config: { params: { vectors: { size: 256 } } } }),
    });
    await expect(store(client).ensureCollection('code', 768)).rejects.toThrow(
      /has vector size 256.*needs 768/,
    );
    expect(calls.createCollection).toHaveLength(0);
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

describe('QdrantStore.search', () => {
  it('maps ids to strings and defaults missing payloads to {}', async () => {
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
