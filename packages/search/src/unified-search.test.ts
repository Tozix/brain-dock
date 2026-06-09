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

  it('normalizes per source so a high-scale source does not bury another source’s top hit', async () => {
    // code scores live in a high, compressed band; memory lower. Raw merge would keep both code
    // hits ahead of memory; per-source normalization lifts memory's own top hit above code's weak one.
    const code = (symbol: string, score: number, startLine: number): SearchResult => ({
      ...codeResult(),
      symbol,
      score,
      startLine,
    });
    const skewed: UnifiedSources = {
      code: {
        async search() {
          return [code('Top', 0.3, 16), code('Weak', 0.28, 99)];
        },
      },
      memory: {
        async search() {
          return [
            { score: 0.2, item: { id: 'm1', type: 'NOTE', content: 'best memory' } },
            { score: 0.05, item: { id: 'm2', type: 'NOTE', content: 'weak memory' } },
          ];
        },
      },
      knowledge: {
        async search() {
          return [];
        },
      },
      documents: {
        async search() {
          return [];
        },
      },
    };
    const results = await new UnifiedSearchService(skewed).search('q', { projectId: 'p' });

    expect(results.every((r) => r.score >= 0 && r.score <= 1)).toBe(true);
    // memory's top hit (m1) outranks code's weak second hit, despite a lower raw score.
    const order = results.map((r) => r.ref);
    expect(order.indexOf('m1')).toBeLessThan(order.indexOf('auth/auth.service.ts:99'));
    expect(results[0]?.rawScore).toBe(0.3); // strongest source still leads via the raw tie-break
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
