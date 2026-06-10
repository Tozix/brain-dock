import { describe, expect, it } from 'bun:test';
import type { RepositoryIndex } from '@brain-dock/indexer';
import type { IngestReport } from '@brain-dock/search';
import { processIndexJob } from './process-index-job';
import type { IndexJob } from './queues';

const job: IndexJob = {
  projectId: 'p1',
  rootDir: './apps/api',
  collection: 'code',
  repo: 'api',
  repositoryId: 'r1',
};

// Minimal index the fake indexer returns (one controller symbol + one DI edge).
const index: RepositoryIndex = {
  rootDir: './apps/api',
  stats: { files: 1, symbols: 1, chunks: 0, relations: 1 },
  files: [
    {
      path: 'cats.controller.ts',
      hash: 'h',
      imports: [],
      chunks: [],
      symbols: [
        {
          name: 'CatsController',
          kind: 'class',
          nestRole: 'controller',
          exported: true,
          decorators: [],
          startLine: 1,
          endLine: 9,
          dependencies: ['CatsService'],
          routes: [{ method: 'get', path: 'cats', handler: 'findAll' }],
        },
      ],
      relations: [{ from: 'CatsController', to: 'CatsService', kind: 'injects' }],
    },
  ],
};

const indexer = { index: () => index };

describe('processIndexJob', () => {
  it('builds the index once, ingests vectors and persists symbols', async () => {
    const ingestCalls: RepositoryIndex[] = [];
    const ingestion = {
      ingestIndex: async (idx: RepositoryIndex): Promise<IngestReport> => {
        ingestCalls.push(idx);
        return { files: 1, chunks: 4 };
      },
    };
    const persistCalls: Array<{ projectId: string; repo: string }> = [];
    const symbols = {
      persist: async (scope: { projectId: string; repo: string }) => {
        persistCalls.push(scope);
        return { symbols: 1, edges: 1 };
      },
    };

    const report = await processIndexJob({ ingestion, indexer, symbols }, job);

    expect(report).toEqual({ files: 1, chunks: 4 });
    expect(ingestCalls).toHaveLength(1);
    expect(persistCalls).toEqual([{ projectId: 'p1', repo: 'api' }]);
  });

  it('skips symbol persistence when no store is configured', async () => {
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => ({ files: 1, chunks: 1 }),
    };
    const report = await processIndexJob({ ingestion, indexer }, job);
    expect(report.chunks).toBe(1);
  });

  it('propagates ingestion failures', async () => {
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => {
        throw new Error('qdrant down');
      },
    };
    await expect(processIndexJob({ ingestion, indexer }, job)).rejects.toThrow('qdrant down');
  });

  it('rethrows symbol persist failures after vectors were written (job retries)', async () => {
    let ingested = 0;
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => {
        ingested += 1;
        return { files: 1, chunks: 2 };
      },
    };
    const symbols = {
      persist: async (): Promise<{ symbols: number; edges: number }> => {
        throw new Error('postgres down');
      },
    };
    await expect(processIndexJob({ ingestion, indexer, symbols }, job)).rejects.toThrow(
      'postgres down',
    );
    expect(ingested).toBe(1); // vectors were already upserted before the persist failed
  });
});
