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
  it('merges all sources, ranks by weighted RRF (code > knowledge > document > memory), and tags the source', async () => {
    // One hit per source ⇒ every hit has rank 1 and the source weights decide the order.
    const results = await new UnifiedSearchService(sources).search('q', { projectId: 'p' });
    expect(results.map((r) => r.source)).toEqual(['code', 'knowledge', 'document', 'memory']);
    expect(results[0]).toMatchObject({ source: 'code', ref: 'auth/auth.service.ts:16' });
    expect(results[0]?.score).toBeCloseTo(1.0 / 61, 6); // w_code / (60 + rank 1)
    expect(results[3]?.score).toBeCloseTo(0.7 / 61, 6); // w_memory / (60 + rank 1)
  });

  it('scores by within-source rank, not raw score scale — a single hit no longer jumps to 1.0', async () => {
    // code raw scores live in a high band, memory's lower — irrelevant for RRF: only the rank
    // inside each source and the source weight matter.
    const code = (symbol: string, score: number, startLine: number): SearchResult => ({
      ...codeResult(),
      symbol,
      score,
      startLine,
    });
    const skewed: UnifiedSources = {
      code: {
        async search() {
          // Deliberately unsorted: RRF must rank by rawScore within the source first.
          return [code('Weak', 0.28, 99), code('Top', 0.3, 16)];
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

    // code (w=1.0) ranks 1–2, then memory (w=0.7) ranks 1–2: w/(60+rank) each.
    expect(results.map((r) => r.ref)).toEqual([
      'auth/auth.service.ts:16',
      'auth/auth.service.ts:99',
      'm1',
      'm2',
    ]);
    expect(results.map((r) => r.score)).toEqual([1.0 / 61, 1.0 / 62, 0.7 / 61, 0.7 / 62]);
    expect(results[0]?.rawScore).toBe(0.3); // raw score preserved for transparency
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
