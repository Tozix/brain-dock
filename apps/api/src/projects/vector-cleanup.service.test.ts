import { describe, expect, it, spyOn } from 'bun:test';
import type { QdrantFilter, QdrantStore } from '@brain-dock/storage';
import { VectorCleanupService } from './vector-cleanup.service';

type Call = { collection: string; filter: QdrantFilter };

/** QdrantStore double recording deleteByFilter calls; `fail` injects per-collection errors. */
function fakeStore(fail: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const store = {
    deleteByFilter: async (collection: string, filter: QdrantFilter) => {
      if (collection in fail) throw fail[collection];
      calls.push({ collection, filter });
    },
  } as unknown as QdrantStore;
  return { store, calls };
}

const projectFilter = (projectId: string): QdrantFilter => ({
  must: [{ key: 'projectId', match: { value: projectId } }],
});

/** Mirrors the Qdrant client's 404 shape that isNotFoundError recognizes. */
const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

describe('VectorCleanupService.purgeProject', () => {
  it('deletes by projectId filter in every configured collection', async () => {
    const { store, calls } = fakeStore();
    await new VectorCleanupService(store, ['code', 'memory', 'knowledge']).purgeProject('p1');
    expect(calls).toEqual([
      { collection: 'code', filter: projectFilter('p1') },
      { collection: 'memory', filter: projectFilter('p1') },
      { collection: 'knowledge', filter: projectFilter('p1') },
    ]);
  });

  it('silently skips collections that do not exist yet (404)', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { store, calls } = fakeStore({ code: notFound() });
      await new VectorCleanupService(store, ['code', 'memory']).purgeProject('p1');
      expect(calls.map((c) => c.collection)).toEqual(['memory']); // continued past the 404
      expect(errorSpy).not.toHaveBeenCalled(); // …and without noise
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs other errors but keeps purging the remaining collections', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { store, calls } = fakeStore({ code: new Error('qdrant is down') });
      await expect(
        new VectorCleanupService(store, ['code', 'memory']).purgeProject('p1'),
      ).resolves.toBeUndefined(); // best-effort: never throws
      expect(calls.map((c) => c.collection)).toEqual(['memory']);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('p1');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
