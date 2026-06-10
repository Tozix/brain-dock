import { describe, expect, it } from 'bun:test';
import { buildRepoMap, type RepoMapEdge, type RepoMapSymbol } from './repo-map';

const sym = (name: string, extra: Partial<RepoMapSymbol> = {}): RepoMapSymbol => ({
  repo: 'api',
  name,
  kind: 'class',
  role: 'service',
  file: `src/${name.toLowerCase()}.ts`,
  startLine: 1,
  routes: [],
  ...extra,
});

const edge = (from: string, to: string): RepoMapEdge => ({ from, to });

describe('buildRepoMap', () => {
  it('ranks a hub (many incoming edges) above a leaf', () => {
    const symbols = ['Hub', 'Leaf', 'A', 'B', 'C'].map((n) => sym(n));
    const edges = [edge('A', 'Hub'), edge('B', 'Hub'), edge('C', 'Hub')];
    const map = buildRepoMap({ symbols, edges });
    expect(map).toContain('Hub');
    expect(map).toContain('Leaf');
    expect(map.indexOf('Hub')).toBeLessThan(map.indexOf('Leaf'));
  });

  it('seedQuery shifts the ranking toward matching symbols', () => {
    const symbols = ['AuthService', 'PaymentsService', 'X', 'Y'].map((n) => sym(n));
    // AuthService is the structural hub; PaymentsService is unreferenced.
    const edges = [edge('X', 'AuthService'), edge('Y', 'AuthService')];

    const neutral = buildRepoMap({ symbols, edges });
    expect(neutral.indexOf('AuthService')).toBeLessThan(neutral.indexOf('PaymentsService'));

    const seeded = buildRepoMap({ symbols, edges, seedQuery: 'payments flow' });
    expect(seeded.indexOf('PaymentsService')).toBeLessThan(seeded.indexOf('AuthService'));
  });

  it('respects the token budget (chars ≈ tokens * 4) while keeping top symbols', () => {
    const symbols = Array.from({ length: 200 }, (_, i) => sym(`Symbol${i}`));
    const edges = Array.from({ length: 50 }, (_, i) => edge(`Symbol${i + 1}`, 'Symbol0'));
    const budget = 150;
    const map = buildRepoMap({ symbols, edges, tokenBudget: budget });
    expect(map.length).toBeLessThanOrEqual(budget * 4);
    expect(map).toContain('Symbol0'); // the hub survives the cut
    expect(map.split('\n').length).toBeLessThan(symbols.length + 1); // actually truncated
  });

  it('renders location, kind, name, role and controller routes', () => {
    const symbols = [
      sym('CatsController', {
        role: 'controller',
        file: 'src/cats.controller.ts',
        startLine: 7,
        routes: [{ method: 'get', path: 'cats', handler: 'findAll' }],
      }),
    ];
    const map = buildRepoMap({ symbols, edges: [] });
    expect(map).toContain('src/cats.controller.ts:7 class CatsController (controller)');
    expect(map).toContain('GET cats → findAll');
  });

  it('prefixes files with the repo alias only for multi-repo input', () => {
    const single = buildRepoMap({ symbols: [sym('A')], edges: [] });
    expect(single).toContain('src/a.ts:1');
    expect(single).not.toContain('api/src/a.ts');

    const multi = buildRepoMap({
      symbols: [sym('A'), sym('B', { repo: 'web' })],
      edges: [],
    });
    expect(multi).toContain('api/src/a.ts:1');
    expect(multi).toContain('web/src/b.ts:1');
  });

  it('notes upstream truncation and handles empty input', () => {
    expect(buildRepoMap({ symbols: [], edges: [] })).toContain('No symbols');
    const map = buildRepoMap({ symbols: [sym('A')], edges: [], truncated: true });
    expect(map).toContain('truncated');
  });
});
