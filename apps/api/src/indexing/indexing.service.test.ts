import { describe, expect, it } from 'bun:test';
import type { RepositoryIndex } from '@brain-dock/indexer';
import { PayloadTooLargeException } from '@nestjs/common';
import { indexFilesSchema } from './indexing.dto';
import { IndexingService } from './indexing.service';

/** Config double — QDRANT_URL is never dialed (ingestion is replaced with a fake below). */
const config = (maxTotalBytes: number) => ({
  env: { QDRANT_URL: 'http://127.0.0.1:1', INDEX_UPLOAD_MAX_TOTAL_BYTES: maxTotalBytes },
});

type IngestCall = { index: RepositoryIndex; options: Record<string, unknown> };
type PersistCall = { scope: { projectId: string; repo: string }; index: RepositoryIndex };
type StatusCall = { where: { id: string }; data: Record<string, unknown> };

/**
 * Builds the service with its (private) ingestion/symbols collaborators swapped for fakes —
 * the real ts-morph parsing still runs, only embedding/Qdrant/Postgres are stubbed out.
 */
function makeService(maxTotalBytes = 1_000_000, ingestImpl?: () => Promise<never>) {
  const statusCalls: StatusCall[] = [];
  const prisma = {
    client: {
      repository: {
        update: async (args: StatusCall) => {
          statusCalls.push(args);
          return {};
        },
      },
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  const service = new IndexingService(config(maxTotalBytes) as any, prisma as any);
  const ingestCalls: IngestCall[] = [];
  const persistCalls: PersistCall[] = [];
  Object.assign(service as unknown as Record<string, unknown>, {
    ingestion: {
      ingestIndex: async (index: RepositoryIndex, options: Record<string, unknown>) => {
        if (ingestImpl) return ingestImpl();
        ingestCalls.push({ index, options });
        return { files: index.files.length, chunks: 7 };
      },
    },
    symbols: {
      persist: async (scope: { projectId: string; repo: string }, index: RepositoryIndex) => {
        persistCalls.push({ scope, index });
        return { symbols: 3, edges: 1 };
      },
    },
  });
  return { service, ingestCalls, persistCalls, statusCalls };
}

describe('IndexingService.indexFiles', () => {
  it('passes projectId/repo/repositoryId through to ingestion and the symbol index', async () => {
    const { service, ingestCalls, persistCalls } = makeService();
    const report = await service.indexFiles('p1', 'api', 'r1', [
      { path: 'src/a.ts', content: 'export class Foo {}' },
    ]);

    expect(report).toEqual({ files: 1, chunks: 7, symbols: 3 });
    expect(ingestCalls).toHaveLength(1);
    expect(ingestCalls[0]?.options).toMatchObject({
      projectId: 'p1',
      repo: 'api',
      repositoryId: 'r1',
    });
    expect(typeof ingestCalls[0]?.options.collection).toBe('string');
    expect(persistCalls).toHaveLength(1);
    expect(persistCalls[0]?.scope).toEqual({ projectId: 'p1', repo: 'api' });
  });

  it('filters out non-TS, declaration and test files before parsing', async () => {
    const { service, ingestCalls } = makeService();
    await service.indexFiles('p1', 'api', 'r1', [
      { path: 'src/a.ts', content: 'export class Foo {}' },
      { path: 'README.md', content: '# docs' },
      { path: 'src/types.d.ts', content: 'declare const x: number;' },
      { path: 'src/a.test.ts', content: 'it("x", () => {});' },
      { path: 'src/a.spec.ts', content: 'it("y", () => {});' },
    ]);
    expect(ingestCalls[0]?.index.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('rejects uploads whose total size exceeds INDEX_UPLOAD_MAX_TOTAL_BYTES', async () => {
    const { service, ingestCalls, statusCalls } = makeService(10);
    await expect(
      service.indexFiles('p1', 'api', 'r1', [
        { path: 'src/a.ts', content: 'x'.repeat(6) },
        { path: 'src/b.ts', content: 'y'.repeat(6) }, // 12 bytes total > 10
      ]),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(ingestCalls).toHaveLength(0); // rejected before any work
    expect(statusCalls).toHaveLength(0); // an oversized request is not a failed indexing run
  });

  it('stamps INDEXING then READY (with counts) on the repository row', async () => {
    const { service, statusCalls } = makeService();
    await service.indexFiles('p1', 'api', 'r1', [
      { path: 'src/a.ts', content: 'export class Foo {}' },
    ]);

    expect(statusCalls.map((c) => c.where.id)).toEqual(['r1', 'r1']);
    expect(statusCalls[0]?.data).toMatchObject({ indexStatus: 'INDEXING', indexError: null });
    expect(statusCalls[1]?.data).toMatchObject({
      indexStatus: 'READY',
      indexError: null,
      indexedFileCount: 1,
      symbolCount: 3,
    });
    expect(statusCalls[1]?.data.lastIndexedAt).toBeInstanceOf(Date);
  });

  it('stamps FAILED with a truncated error and rethrows when ingestion fails', async () => {
    const { service, statusCalls } = makeService(1_000_000, async () => {
      throw new Error(`qdrant exploded ${'x'.repeat(2000)}`);
    });
    await expect(
      service.indexFiles('p1', 'api', 'r1', [{ path: 'src/a.ts', content: 'export class A {}' }]),
    ).rejects.toThrow('qdrant exploded');

    expect(statusCalls.map((c) => c.data.indexStatus)).toEqual(['INDEXING', 'FAILED']);
    const failed = statusCalls[1]?.data;
    expect(String(failed?.indexError)).toStartWith('qdrant exploded');
    expect(String(failed?.indexError).length).toBe(1000);
  });
});

describe('indexFilesSchema', () => {
  const file = { path: 'src/a.ts', content: 'export {}' };

  it('accepts a sane upload', () => {
    expect(indexFilesSchema.safeParse({ files: [file] }).success).toBe(true);
  });

  it('caps the file count at 10000', () => {
    const files = Array.from({ length: 10_001 }, () => file);
    expect(indexFilesSchema.safeParse({ files }).success).toBe(false);
    expect(indexFilesSchema.safeParse({ files: files.slice(0, 10_000) }).success).toBe(true);
  });

  it('caps a single file content at 2,000,000 chars', () => {
    const over = { path: 'big.ts', content: 'x'.repeat(2_000_001) };
    expect(indexFilesSchema.safeParse({ files: [over] }).success).toBe(false);
    const at = { path: 'big.ts', content: 'x'.repeat(2_000_000) };
    expect(indexFilesSchema.safeParse({ files: [at] }).success).toBe(true);
  });

  it('rejects empty and over-long paths', () => {
    expect(indexFilesSchema.safeParse({ files: [{ path: '', content: 'x' }] }).success).toBe(false);
    const longPath = { path: 'a'.repeat(1001), content: 'x' };
    expect(indexFilesSchema.safeParse({ files: [longPath] }).success).toBe(false);
  });
});
