import { describe, expect, it } from 'bun:test';
import type { SearchResult } from './types';
import { UnifiedSearchService, type UnifiedSources } from './unified-search';

function codeResult(): SearchResult {
  return {
    projectId: 'p',
    repo: 'default',
    path: 'auth/auth.service.ts',
    symbol: 'AuthService',
    kind: 'class',
    role: 'service',
    startLine: 16,
    endLine: 40,
    model: 'm',
    text: 'jwt token refresh',
    score: 0.4,
  };
}

const sources: UnifiedSources = {
  code: {
    async search() {
      return [codeResult()];
    },
  },
  memory: {
    async search() {
      return [{ score: 0.9, item: { id: 'm1', type: 'DECISION', content: 'we run on Bun' } }];
    },
  },
  knowledge: {
    async search() {
      return [
        { score: 0.6, item: { id: 'k1', type: 'ADR', title: 'Stack', content: 'bun + nest' } },
      ];
    },
  },
  documents: {
    async search() {
      return [
        {
          score: 0.5,
          document: { id: 'd1', title: 'Guide', format: 'MD', content: 'deploy steps' },
        },
      ];
    },
  },
};

describe('UnifiedSearchService', () => {
  it('merges all sources, ranks by score, and tags the source', async () => {
    const results = await new UnifiedSearchService(sources).search('q', { projectId: 'p' });
    expect(results.map((r) => r.source)).toEqual(['memory', 'knowledge', 'document', 'code']);
    expect(results[0]).toMatchObject({ source: 'memory', ref: 'm1' });
    expect(results.find((r) => r.source === 'code')?.ref).toBe('auth/auth.service.ts:16');
  });

  it('respects the limit', async () => {
    const results = await new UnifiedSearchService(sources).search('q', {
      projectId: 'p',
      limit: 2,
    });
    expect(results).toHaveLength(2);
  });

  it('ignores a failing source instead of failing the whole query', async () => {
    const broken: UnifiedSources = {
      ...sources,
      documents: {
        async search() {
          throw new Error('qdrant down');
        },
      },
    };
    const results = await new UnifiedSearchService(broken).search('q', { projectId: 'p' });
    expect(results.some((r) => r.source === 'document')).toBe(false);
    expect(results.some((r) => r.source === 'memory')).toBe(true);
  });
});
