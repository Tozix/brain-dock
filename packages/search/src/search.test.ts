import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { CollectionMode, QdrantFilter, SearchHit, SparseVector } from '@brain-dock/storage';
import { SearchService } from './search';
import type { ChunkPayload } from './types';

function hit(id: string, score: number, payload: Partial<ChunkPayload>): SearchHit {
  return {
    id,
    score,
    payload: {
      projectId: 'p1',
      path: 'x.ts',
      symbol: 'X',
      kind: 'class',
      role: 'service',
      startLine: 1,
      endLine: 9,
      model: 'deterministic-hash-v1',
      text: '',
      ...payload,
    },
  };
}

interface HybridCall {
  dense: number[];
  sparse: SparseVector;
  limit?: number;
  prefetchLimit?: number;
  filter?: QdrantFilter;
}

/** Fake store: legacy collections answer `search`, hybrid collections answer `hybridQuery`. */
function fakeStore(options: {
  mode: CollectionMode;
  searchHits?: SearchHit[];
  hybridHits?: SearchHit[];
}) {
  const calls: { search: Array<{ filter?: QdrantFilter; limit?: number }>; hybrid: HybridCall[] } =
    { search: [], hybrid: [] };
  const store = {
    async collectionMode(): Promise<CollectionMode> {
      return options.mode;
    },
    async search(
      _name: string,
      _vector: number[],
      opts: { limit?: number; filter?: QdrantFilter } = {},
    ): Promise<SearchHit[]> {
      calls.search.push(opts);
      return options.searchHits ?? [];
    },
    async hybridQuery(_name: string, opts: HybridCall): Promise<SearchHit[]> {
      calls.hybrid.push(opts);
      return options.hybridHits ?? [];
    },
  };
  return { store, calls };
}

describe('SearchService — legacy (dense + keyword boost)', () => {
  it('lets keyword overlap reorder above raw vector score, and forwards the project filter', async () => {
    const { store, calls } = fakeStore({
      mode: 'legacy',
      searchHits: [
        // higher vector score but no keyword overlap
        hit('2', 0.6, { symbol: 'CatsService', path: 'cats.ts', text: 'cats meow purr' }),
        // lower vector score but strong keyword overlap with the query
        hit('1', 0.5, { symbol: 'AuthService', path: 'auth.ts', text: 'jwt token refresh login' }),
      ],
    });

    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    const results = await service.search('jwt token', {
      projectId: 'p1',
      collection: 'code',
      limit: 5,
    });

    expect(results[0]?.symbol).toBe('AuthService');
    expect(results[1]?.symbol).toBe('CatsService');
    expect(calls.search[0]?.filter).toEqual({
      must: [{ key: 'projectId', match: { value: 'p1' } }],
    });
    expect(calls.hybrid).toHaveLength(0);
  });

  it('adds a repo "any" filter when repos are provided', async () => {
    const { store, calls } = fakeStore({ mode: 'legacy' });
    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    await service.search('q', { projectId: 'p1', collection: 'code', repos: ['api', 'web'] });

    expect(calls.search[0]?.filter).toEqual({
      must: [
        { key: 'projectId', match: { value: 'p1' } },
        { key: 'repo', match: { any: ['api', 'web'] } },
      ],
    });
  });

  it('respects the result limit', async () => {
    const { store } = fakeStore({
      mode: 'legacy',
      searchHits: Array.from({ length: 10 }, (_, i) => hit(String(i), 0.5 - i * 0.01, {})),
    });
    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    const results = await service.search('anything', {
      projectId: 'p1',
      collection: 'code',
      limit: 3,
    });
    expect(results).toHaveLength(3);
  });
});

describe('SearchService — hybrid (server-side BM25 + RRF)', () => {
  it('sends dense + BM25 sparse vectors and keeps the server ranking (no keyword boost)', async () => {
    const { store, calls } = fakeStore({
      mode: 'hybrid',
      hybridHits: [
        // Server-fused order: a hit with zero keyword overlap stays first.
        hit('2', 0.9, { symbol: 'CatsService', path: 'cats.ts', text: 'cats meow purr' }),
        hit('1', 0.4, { symbol: 'AuthService', path: 'auth.ts', text: 'jwt token refresh' }),
      ],
    });

    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    const results = await service.search('jwt token', {
      projectId: 'p1',
      collection: 'code',
      limit: 5,
    });

    expect(results.map((r) => r.symbol)).toEqual(['CatsService', 'AuthService']);
    expect(results[0]?.score).toBe(0.9); // RRF score passed through untouched
    expect(calls.search).toHaveLength(0);

    const call = calls.hybrid[0];
    expect(call?.dense).toHaveLength(64);
    expect(call?.sparse.indices.length).toBeGreaterThan(0);
    expect(call?.sparse.indices).toHaveLength(call?.sparse.values.length ?? -1);
    expect(call?.limit).toBe(5);
    expect(call?.prefetchLimit).toBe(15);
    expect(call?.filter).toEqual({ must: [{ key: 'projectId', match: { value: 'p1' } }] });
  });

  it('forwards the repo filter to the hybrid query', async () => {
    const { store, calls } = fakeStore({ mode: 'hybrid' });
    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    await service.search('q', { projectId: 'p1', collection: 'code', repos: ['api'] });

    expect(calls.hybrid[0]?.filter).toEqual({
      must: [
        { key: 'projectId', match: { value: 'p1' } },
        { key: 'repo', match: { any: ['api'] } },
      ],
    });
  });

  it('falls back to dense-only search when the query yields no sparse tokens', async () => {
    const { store, calls } = fakeStore({ mode: 'hybrid', searchHits: [] });
    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    await service.search('!!! ###', { projectId: 'p1', collection: 'code' });

    expect(calls.hybrid).toHaveLength(0);
    expect(calls.search).toHaveLength(1);
  });
});
