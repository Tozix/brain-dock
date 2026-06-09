import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantFilter, SearchHit } from '@brain-dock/storage';
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

describe('SearchService — hybrid ranking', () => {
  it('lets keyword overlap reorder above raw vector score, and forwards the project filter', async () => {
    let capturedFilter: QdrantFilter | undefined;
    const store = {
      async search(
        _name: string,
        _vector: number[],
        options?: { limit?: number; filter?: QdrantFilter },
      ): Promise<SearchHit[]> {
        capturedFilter = options?.filter;
        return [
          // higher vector score but no keyword overlap
          hit('2', 0.6, { symbol: 'CatsService', path: 'cats.ts', text: 'cats meow purr' }),
          // lower vector score but strong keyword overlap with the query
          hit('1', 0.5, {
            symbol: 'AuthService',
            path: 'auth.ts',
            text: 'jwt token refresh login',
          }),
        ];
      },
    };

    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    const results = await service.search('jwt token', {
      projectId: 'p1',
      collection: 'code',
      limit: 5,
    });

    expect(results[0]?.symbol).toBe('AuthService');
    expect(results[1]?.symbol).toBe('CatsService');
    expect(capturedFilter).toEqual({ must: [{ key: 'projectId', match: { value: 'p1' } }] });
  });

  it('adds a repo "any" filter when repos are provided', async () => {
    let capturedFilter: QdrantFilter | undefined;
    const store = {
      async search(
        _name: string,
        _vector: number[],
        options?: { limit?: number; filter?: QdrantFilter },
      ): Promise<SearchHit[]> {
        capturedFilter = options?.filter;
        return [];
      },
    };
    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    await service.search('q', { projectId: 'p1', collection: 'code', repos: ['api', 'web'] });

    expect(capturedFilter).toEqual({
      must: [
        { key: 'projectId', match: { value: 'p1' } },
        { key: 'repo', match: { any: ['api', 'web'] } },
      ],
    });
  });

  it('respects the result limit', async () => {
    const store = {
      async search(): Promise<SearchHit[]> {
        return Array.from({ length: 10 }, (_, i) => hit(String(i), 0.5 - i * 0.01, {}));
      },
    };
    const service = new SearchService(new DeterministicEmbeddingProvider(64), store);
    const results = await service.search('anything', {
      projectId: 'p1',
      collection: 'code',
      limit: 3,
    });
    expect(results).toHaveLength(3);
  });
});
