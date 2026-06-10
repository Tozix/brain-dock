import { describe, expect, it } from 'bun:test';
import type { IndexedSymbol, RepositoryIndex, SymbolRelation } from '@brain-dock/indexer';
import { SymbolIndexService } from './symbol-index.service';

// Fake prisma returning fixed symbol/edge rows — exercises graph reconstruction from the DB shape.
function fakePrisma(symbols: unknown[], edges: unknown[]) {
  return {
    codeSymbol: { findMany: async () => symbols },
    codeEdge: { findMany: async () => edges },
    // biome-ignore lint/suspicious/noExplicitAny: minimal prisma double.
  } as any;
}

type ScopeWhere = {
  projectId?: string;
  repo?: string | { in: string[] };
  role?: string;
  name?: { contains: string };
};

type StoredRow = Record<string, unknown> & { projectId: string; repo: string };

function matchesWhere(row: StoredRow, where: ScopeWhere): boolean {
  if (where.projectId !== undefined && row.projectId !== where.projectId) return false;
  if (typeof where.repo === 'string' && row.repo !== where.repo) return false;
  if (typeof where.repo === 'object' && where.repo !== null && !where.repo.in.includes(row.repo)) {
    return false;
  }
  if (where.role !== undefined && row.role !== where.role) return false;
  if (
    where.name !== undefined &&
    !String(row.name).toLowerCase().includes(where.name.contains.toLowerCase())
  ) {
    return false;
  }
  return true;
}

/**
 * Stateful prisma double for codeSymbol/codeEdge with deleteMany/createMany/findMany —
 * exercises persist()'s wholesale-replace transaction. The fake executes operations eagerly
 * (at call time), which preserves the delete-then-create ordering of the $transaction array.
 */
function statefulPrisma() {
  const symbols: StoredRow[] = [];
  const edges: StoredRow[] = [];
  const model = (rows: StoredRow[]) => ({
    deleteMany: async ({ where }: { where: ScopeWhere }) => {
      const keep = rows.filter((r) => !matchesWhere(r, where));
      const count = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      return { count };
    },
    createMany: async ({ data }: { data: StoredRow[] }) => {
      rows.push(...data);
      return { count: data.length };
    },
    findMany: async ({ where }: { where?: ScopeWhere } = {}) =>
      rows.filter((r) => matchesWhere(r, where ?? {})),
    count: async ({ where }: { where?: ScopeWhere } = {}) =>
      rows.filter((r) => matchesWhere(r, where ?? {})).length,
  });
  return {
    symbols,
    edges,
    codeSymbol: model(symbols),
    codeEdge: model(edges),
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    // biome-ignore lint/suspicious/noExplicitAny: minimal prisma double.
  } as any;
}

const sym = (name: string, role = 'service'): IndexedSymbol => ({
  name,
  kind: 'class',
  // biome-ignore lint/suspicious/noExplicitAny: any string role is valid in the DB shape.
  nestRole: role as any,
  exported: true,
  decorators: [],
  startLine: 1,
  endLine: 5,
  dependencies: [],
  routes: [],
});

const repoIndex = (names: string[], relations: SymbolRelation[] = []): RepositoryIndex => ({
  rootDir: '.',
  files: [
    {
      path: 'src/a.ts',
      hash: 'h',
      symbols: names.map((n) => sym(n)),
      imports: [],
      relations,
      chunks: [],
    },
  ],
  stats: { files: 1, symbols: names.length, chunks: 0, relations: relations.length },
});

describe('SymbolIndexService.persist', () => {
  it('wholesale-replaces symbols and edges of the same projectId+repo scope', async () => {
    const prisma = statefulPrisma();
    const svc = new SymbolIndexService(prisma);

    await svc.persist(
      { projectId: 'p1', repo: 'api' },
      repoIndex(['A', 'B'], [{ from: 'A', to: 'B', kind: 'injects' }]),
    );
    const first = await svc.findSymbols('p1');
    expect(first.map((s) => s.name).sort()).toEqual(['A', 'B']);

    // Re-persist the same scope with different content — old rows must be gone.
    const res = await svc.persist({ projectId: 'p1', repo: 'api' }, repoIndex(['C']));
    expect(res).toEqual({ symbols: 1, edges: 0 });
    const second = await svc.findSymbols('p1');
    expect(second.map((s) => s.name)).toEqual(['C']);
    expect(prisma.edges).toHaveLength(0); // edges of the old persist were replaced too
  });

  it('leaves other repos and other projects untouched', async () => {
    const prisma = statefulPrisma();
    const svc = new SymbolIndexService(prisma);
    await svc.persist({ projectId: 'p1', repo: 'api' }, repoIndex(['ApiThing']));
    await svc.persist({ projectId: 'p1', repo: 'web' }, repoIndex(['WebThing']));
    await svc.persist({ projectId: 'p2', repo: 'api' }, repoIndex(['OtherProject']));

    await svc.persist({ projectId: 'p1', repo: 'api' }, repoIndex(['ApiThing2']));

    expect((await svc.findSymbols('p1')).map((s) => s.name).sort()).toEqual([
      'ApiThing2',
      'WebThing',
    ]);
    expect((await svc.findSymbols('p2')).map((s) => s.name)).toEqual(['OtherProject']);
  });
});

describe('SymbolIndexService.findSymbols', () => {
  it('filters by repos when given', async () => {
    const prisma = statefulPrisma();
    const svc = new SymbolIndexService(prisma);
    await svc.persist({ projectId: 'p1', repo: 'api' }, repoIndex(['ApiThing']));
    await svc.persist({ projectId: 'p1', repo: 'web' }, repoIndex(['WebThing']));

    expect((await svc.findSymbols('p1', { repos: ['web'] })).map((s) => s.name)).toEqual([
      'WebThing',
    ]);
    // An empty repos array means "no repo filter", not "match nothing".
    expect((await svc.findSymbols('p1', { repos: [] })).map((s) => s.name).sort()).toEqual([
      'ApiThing',
      'WebThing',
    ]);
  });
});

describe('SymbolIndexService.repoMap', () => {
  it('builds a ranked, budgeted map from stored symbols and edges', async () => {
    const svc = new SymbolIndexService(
      fakePrisma(
        [
          {
            name: 'OrdersService',
            kind: 'class',
            role: 'service',
            file: 'o.ts',
            startLine: 3,
            repo: 'api',
            routes: null,
          },
          {
            name: 'PaymentsClient',
            kind: 'class',
            role: 'service',
            file: 'p.ts',
            startLine: 1,
            repo: 'api',
            routes: null,
          },
        ],
        [{ fromName: 'OrdersService', toName: 'PaymentsClient' }],
      ),
    );
    const map = await svc.repoMap('p1');
    expect(map).toContain('Repo map');
    expect(map).toContain('o.ts:3 class OrdersService (service)');
    // PaymentsClient is the dependency hub → ranked above OrdersService.
    expect(map.indexOf('PaymentsClient')).toBeLessThan(map.indexOf('OrdersService'));
  });
});

describe('SymbolIndexService.graph', () => {
  it('rebuilds a dependency graph from stored symbols + edges', async () => {
    const svc = new SymbolIndexService(
      fakePrisma(
        [
          { name: 'OrdersService', kind: 'class', role: 'service', file: 'o.ts', repo: 'api' },
          { name: 'PaymentsClient', kind: 'class', role: 'service', file: 'p.ts', repo: 'api' },
        ],
        [{ fromName: 'OrdersService', toName: 'PaymentsClient', kind: 'injects' }],
      ),
    );

    const graph = await svc.graph('p1');
    expect(graph.dependencies('OrdersService')).toContain('PaymentsClient');
    expect(graph.dependents('PaymentsClient')).toContain('OrdersService');
    expect(graph.node('PaymentsClient')?.repo).toBe('api');
    expect(graph.impact('PaymentsClient')).toContain('OrdersService');
  });
});
