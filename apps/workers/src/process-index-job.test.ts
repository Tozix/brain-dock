import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepositoryIndex } from '@brain-dock/indexer';
import type { IngestReport } from '@brain-dock/search';
import {
  processIndexJob,
  type RepositoryStatusPatch,
  type RepositoryStatusStore,
} from './process-index-job';
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

  it('stamps INDEXING then READY (with counts) on the repository', async () => {
    const calls: Array<{ id: string; patch: RepositoryStatusPatch }> = [];
    const repositories: RepositoryStatusStore = {
      updateStatus: async (id, patch) => void calls.push({ id, patch }),
    };
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => ({ files: 1, chunks: 4 }),
    };

    await processIndexJob({ ingestion, indexer, repositories }, job);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ id: 'r1', patch: { indexStatus: 'INDEXING' } });
    expect(calls[1]?.patch).toMatchObject({
      indexStatus: 'READY',
      indexError: null,
      indexedFileCount: 1,
      symbolCount: 1,
    });
    expect(calls[1]?.patch.lastIndexedAt).toBeInstanceOf(Date);
  });

  it('stamps FAILED with a truncated error and still rethrows', async () => {
    const calls: RepositoryStatusPatch[] = [];
    const repositories: RepositoryStatusStore = {
      updateStatus: async (_id, patch) => void calls.push(patch),
    };
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => {
        throw new Error(`qdrant down ${'x'.repeat(2000)}`);
      },
    };

    await expect(processIndexJob({ ingestion, indexer, repositories }, job)).rejects.toThrow(
      'qdrant down',
    );
    expect(calls.map((p) => p.indexStatus)).toEqual(['INDEXING', 'FAILED']);
    expect(calls[1]?.indexError?.length).toBe(1000);
    expect(calls[1]?.indexError).toStartWith('qdrant down');
  });

  it('skips status updates for legacy jobs without repositoryId', async () => {
    const calls: RepositoryStatusPatch[] = [];
    const repositories: RepositoryStatusStore = {
      updateStatus: async (_id, patch) => void calls.push(patch),
    };
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => ({ files: 1, chunks: 1 }),
    };
    const legacy: IndexJob = { projectId: 'p1', rootDir: './apps/api', collection: 'code' };

    const report = await processIndexJob({ ingestion, indexer, repositories }, legacy);
    expect(report.files).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('a failing status store does not fail the job', async () => {
    const repositories: RepositoryStatusStore = {
      updateStatus: async () => {
        throw new Error('repository row gone');
      },
    };
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => ({ files: 1, chunks: 2 }),
    };
    const report = await processIndexJob({ ingestion, indexer, repositories }, job);
    expect(report).toEqual({ files: 1, chunks: 2 });
  });

  it('deletes the staging directory after an upload job', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bd-upload-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'a.ts'), 'export class A {}', 'utf8');
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => ({ files: 1, chunks: 1 }),
    };

    await processIndexJob({ ingestion, indexer }, { ...job, kind: 'upload', rootDir: dir });

    // The throwaway staging dir is removed once the upload job finishes.
    await expect(stat(dir)).rejects.toThrow();
  });

  it('deletes the staging directory even when an upload job fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bd-upload-fail-'));
    const ingestion = {
      ingestIndex: async (): Promise<IngestReport> => {
        throw new Error('qdrant down');
      },
    };
    await expect(
      processIndexJob({ ingestion, indexer }, { ...job, kind: 'upload', rootDir: dir }),
    ).rejects.toThrow('qdrant down');
    await expect(stat(dir)).rejects.toThrow();
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
