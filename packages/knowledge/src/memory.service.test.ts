import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantStore } from '@brain-dock/storage';
import { MemoryService } from './memory.service';

type Row = {
  id: string;
  projectId: string;
  type: string;
  content: string;
  tags: string[];
  createdAt: Date;
};

/** Minimal in-memory Prisma double for the `memoryItem` model. */
function fakePrisma(seed: Row[] = []) {
  const rows = [...seed];
  let seq = seed.length;
  return {
    rows,
    memoryItem: {
      create: async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
        const row: Row = { id: `m${++seq}`, createdAt: new Date(0), ...data };
        rows.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const before = rows.length;
        const i = rows.findIndex((r) => r.id === where.id);
        if (i >= 0) rows.splice(i, 1);
        return { count: before - rows.length };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; projectId: string };
        data: Partial<Row>;
      }) => {
        const row = rows.find((r) => r.id === where.id && r.projectId === where.projectId);
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) Object.assign(row, { [key]: value });
        }
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((r) => r.id === where.id) ?? null,
    },
  };
}

/** Store double whose writes always fail — simulates Qdrant being down mid-request. */
function brokenStore(): QdrantStore {
  return {
    ensureCollection: async () => {},
    upsert: async () => {
      throw new Error('qdrant down');
    },
    deletePoints: async () => {},
    search: async () => [],
  } as unknown as QdrantStore;
}

const make = (prisma: ReturnType<typeof fakePrisma>) =>
  // biome-ignore lint/suspicious/noExplicitAny: prisma test double.
  new MemoryService(prisma as any, new DeterministicEmbeddingProvider(64), brokenStore());

describe('MemoryService dual-write compensation', () => {
  it('rolls back the created row when the vector write fails', async () => {
    const prisma = fakePrisma();
    const service = make(prisma);
    await expect(service.remember({ projectId: 'p1', content: 'we chose Bun' })).rejects.toThrow(
      'qdrant down',
    );
    expect(prisma.rows).toHaveLength(0); // no orphaned Postgres row
  });

  it('flags a possibly-stale vector index when the write fails on update', async () => {
    const prisma = fakePrisma([
      { id: 'm1', projectId: 'p1', type: 'NOTE', content: 'old', tags: [], createdAt: new Date(0) },
    ]);
    const service = make(prisma);
    await expect(service.update('p1', 'm1', { content: 'new' })).rejects.toThrow(
      /vector index may be stale/,
    );
    expect(prisma.rows[0]?.content).toBe('new'); // Postgres update stands; only the vector lagged
  });
});
