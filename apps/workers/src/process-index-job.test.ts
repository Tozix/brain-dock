import { describe, expect, it } from 'bun:test';
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

describe('processIndexJob', () => {
  it('forwards repo + repositoryId to ingestion and returns its report', async () => {
    const calls: Array<{ rootDir: string; options: unknown }> = [];
    const ingestion = {
      ingestRepository: async (rootDir: string, options: unknown): Promise<IngestReport> => {
        calls.push({ rootDir, options });
        return { files: 3, chunks: 7 };
      },
    };

    const report = await processIndexJob(ingestion, job);

    expect(report).toEqual({ files: 3, chunks: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      rootDir: './apps/api',
      options: { projectId: 'p1', collection: 'code', repo: 'api', repositoryId: 'r1' },
    });
  });

  it('propagates ingestion failures', async () => {
    const ingestion = {
      ingestRepository: async (): Promise<IngestReport> => {
        throw new Error('qdrant down');
      },
    };
    await expect(processIndexJob(ingestion, job)).rejects.toThrow('qdrant down');
  });
});
