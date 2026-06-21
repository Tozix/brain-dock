import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IndexJob } from '@brain-dock/core';
import { indexFilesSchema } from './indexing.dto';
import { IndexingService } from './indexing.service';

type StatusCall = { where: { id: string }; data: Record<string, unknown> };

let stagingBase: string;

beforeEach(() => {
  stagingBase = join(tmpdir(), `bd-test-staging-${randomUUID()}`);
});
afterEach(async () => {
  await rm(stagingBase, { recursive: true, force: true }).catch(() => {});
});

function makeService(maxTotalBytes = 1_000_000, enqueueImpl?: () => Promise<void>) {
  const statusCalls: StatusCall[] = [];
  const enqueued: IndexJob[] = [];
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
  const queue = {
    enqueue: async (job: IndexJob) => {
      if (enqueueImpl) return enqueueImpl();
      enqueued.push(job);
    },
  };
  const config = {
    env: { INDEX_UPLOAD_MAX_TOTAL_BYTES: maxTotalBytes, INDEX_STAGING_DIR: stagingBase },
  };
  const service = new IndexingService(
    // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
    config as any,
    // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
    prisma as any,
    queue,
  );
  return { service, statusCalls, enqueued };
}

describe('IndexingService.enqueueUpload', () => {
  it('stages files, stamps QUEUED and enqueues an upload job', async () => {
    const { service, statusCalls, enqueued } = makeService();
    const result = await service.enqueueUpload('p1', 'api', 'r1', [
      { path: 'src/a.ts', content: 'export class Foo {}' },
      { path: 'src/nested/b.ts', content: 'export const b = 1;' },
    ]);

    expect(result).toEqual({ repositoryId: 'r1', status: 'QUEUED' });

    // QUEUED stamped on the repository row.
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0]).toMatchObject({
      where: { id: 'r1' },
      data: { indexStatus: 'QUEUED', indexError: null },
    });

    // Exactly one upload job enqueued, pointing at a staging dir under the configured base.
    expect(enqueued).toHaveLength(1);
    const job = enqueued[0];
    expect(job?.kind).toBe('upload');
    expect(job?.projectId).toBe('p1');
    expect(job?.repo).toBe('api');
    expect(job?.repositoryId).toBe('r1');
    expect(typeof job?.collection).toBe('string');
    expect(job?.rootDir.startsWith(stagingBase)).toBe(true);

    // Files were actually written into the staging dir at their relative paths.
    expect(await readFile(join(job?.rootDir ?? '', 'src/a.ts'), 'utf8')).toBe(
      'export class Foo {}',
    );
    expect(await readFile(join(job?.rootDir ?? '', 'src/nested/b.ts'), 'utf8')).toBe(
      'export const b = 1;',
    );
  });

  it('ignores files whose path escapes the staging directory (path traversal)', async () => {
    const { service, enqueued } = makeService();
    await service.enqueueUpload('p1', 'api', 'r1', [
      { path: 'src/ok.ts', content: 'export const ok = 1;' },
      { path: '../escape.ts', content: 'export const bad = 1;' },
      { path: '/abs.ts', content: 'export const abs = 1;' },
    ]);

    const root = enqueued[0]?.rootDir ?? '';
    expect(await readFile(join(root, 'src/ok.ts'), 'utf8')).toBe('export const ok = 1;');
    // The escaping paths were skipped — nothing written outside (or at the root of) the staging dir.
    await expect(stat(join(stagingBase, 'escape.ts'))).rejects.toThrow();
    await expect(stat(join(root, 'abs.ts'))).rejects.toThrow();
  });

  it('rejects uploads over INDEX_UPLOAD_MAX_TOTAL_BYTES before staging or enqueueing', async () => {
    const { service, statusCalls, enqueued } = makeService(10);
    await expect(
      service.enqueueUpload('p1', 'api', 'r1', [
        { path: 'src/a.ts', content: 'x'.repeat(6) },
        { path: 'src/b.ts', content: 'y'.repeat(6) }, // 12 bytes total > 10
      ]),
    ).rejects.toThrow();
    expect(statusCalls).toHaveLength(0); // an oversized request is not a queued indexing run
    expect(enqueued).toHaveLength(0);
    await expect(stat(stagingBase)).rejects.toThrow(); // nothing staged
  });

  it('removes the staging dir and rethrows when enqueue fails', async () => {
    const { service } = makeService(1_000_000, async () => {
      throw new Error('redis down');
    });
    await expect(
      service.enqueueUpload('p1', 'api', 'r1', [{ path: 'src/a.ts', content: 'export {}' }]),
    ).rejects.toThrow('redis down');
    // The staging base may exist but must hold no leftover repository dir for this upload.
    const { readdir } = await import('node:fs/promises');
    const left = await readdir(stagingBase).catch(() => [] as string[]);
    expect(left).toHaveLength(0);
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
