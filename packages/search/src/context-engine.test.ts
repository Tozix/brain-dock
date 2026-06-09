import { describe, expect, it } from 'bun:test';
import { ContextEngine } from './context-engine';
import type { QueryOptions } from './search';
import type { SearchResult } from './types';

function result(symbol: string, role: string, score: number, text = 'line1\nline2'): SearchResult {
  return {
    projectId: 'p1',
    repo: 'default',
    path: `${symbol}.ts`,
    symbol,
    kind: 'class',
    role,
    startLine: 1,
    endLine: 9,
    model: 'm',
    text,
    score,
  };
}

function engineWith(results: SearchResult[]) {
  return new ContextEngine({
    async search(_q: string, _o: QueryOptions): Promise<SearchResult[]> {
      return results;
    },
  });
}

const opts = { projectId: 'p1', collection: 'code' };

describe('ContextEngine', () => {
  it('applies intent role-boosts during re-ranking', async () => {
    // debug intent boosts services (+0.3): the service overtakes a higher-base module.
    const engine = engineWith([
      result('AppModule', 'module', 0.5),
      result('AuthService', 'service', 0.45),
    ]);
    const ctx = await engine.buildContext('fix the login bug', opts);
    expect(ctx.intent).toBe('debug');
    expect(ctx.items[0]?.symbol).toBe('AuthService');
  });

  it('dedupes by path#symbol and respects the limit', async () => {
    const engine = engineWith([
      result('A', 'service', 0.9),
      result('A', 'service', 0.8), // duplicate
      result('B', 'service', 0.7),
      result('C', 'service', 0.6),
    ]);
    const ctx = await engine.buildContext('explore', { ...opts, limit: 2 });
    expect(ctx.items).toHaveLength(2);
    expect(ctx.items.map((i) => i.symbol)).toEqual(['A', 'B']);
  });

  it('renders a budget-bounded context block', async () => {
    const engine = engineWith([result('AuthService', 'service', 0.9)]);
    const ctx = await engine.buildContext('how does auth work', opts);
    expect(ctx.text).toContain('# Context for:');
    expect(ctx.text).toContain('AuthService.ts:1');
    expect(ctx.stats.included).toBe(1);
  });

  it('truncates long snippets to the line budget', async () => {
    const longText = Array.from({ length: 50 }, (_, i) => `line${i}`).join('\n');
    const engine = engineWith([result('Big', 'service', 0.9, longText)]);
    const ctx = await engine.buildContext('explore', { ...opts, snippetLines: 10 });
    expect(ctx.items[0]?.snippet).toContain('more lines');
  });

  it('boosts dependency-graph neighbours and annotates related symbols', async () => {
    const engine = engineWith([
      result('Controller', 'controller', 0.9),
      result('ServiceX', 'service', 0.5),
      result('Helper', 'service', 0.45),
    ]);
    const neighbors = (s: string) => (s === 'Controller' ? ['Helper'] : []);

    const ctx = await engine.buildContext('explore the controller', {
      ...opts,
      limit: 2,
      neighbors,
    });

    // Helper (0.45 + 0.15 graph boost) overtakes ServiceX (0.5) and gets included.
    expect(ctx.items.map((i) => i.symbol)).toEqual(['Controller', 'Helper']);
    expect(ctx.items[0]?.related).toContain('Helper');
    expect(ctx.text).toContain('related: Helper');
  });
});
