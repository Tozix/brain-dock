import { describe, expect, it } from 'bun:test';
import { SymbolIndexService } from './symbol-index.service';

// Fake prisma returning fixed symbol/edge rows — exercises graph reconstruction from the DB shape.
function fakePrisma(symbols: unknown[], edges: unknown[]) {
  return {
    codeSymbol: { findMany: async () => symbols },
    codeEdge: { findMany: async () => edges },
    // biome-ignore lint/suspicious/noExplicitAny: minimal prisma double.
  } as any;
}

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
