import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantFilter, QdrantStore, VectorPoint } from '@brain-dock/storage';
import { KnowledgeService } from './knowledge.service';

type Row = {
  id: string;
  projectId: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
};

/** Minimal in-memory Prisma double for the `knowledgeItem` model. */
function fakePrisma(seed: Row[] = []) {
  const rows = [...seed];
  let seq = seed.length;
  return {
    rows,
    knowledgeItem: {
      create: async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
        const row: Row = { id: `k${++seq}`, createdAt: new Date(0), ...data };
        rows.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { id: string; projectId?: string } }) => {
        const before = rows.length;
        const i = rows.findIndex(
          (r) => r.id === where.id && (!where.projectId || r.projectId === where.projectId),
        );
        if (i >= 0) rows.splice(i, 1);
        return { count: before - rows.length };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id?: { in: string[] }; projectId?: string } }) =>
        rows.filter(
          (r) =>
            (!where.id || where.id.in.includes(r.id)) &&
            (!where.projectId || r.projectId === where.projectId),
        ),
    },
  };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Working in-memory vector store: real cosine ranking + projectId filtering. */
function memoryStore() {
  const points = new Map<string, VectorPoint>();
  const store = {
    ensureCollection: async () => {},
    upsert: async (_c: string, ps: VectorPoint[]) => {
      for (const p of ps) points.set(p.id, p);
    },
    deletePoints: async (_c: string, ids: string[]) => {
      for (const id of ids) points.delete(id);
    },
    search: async (
      _c: string,
      vector: number[],
      opts: { limit?: number; filter?: QdrantFilter },
    ) => {
      const match = opts.filter?.must?.find((m) => m.key === 'projectId')?.match;
      const projectId = match && 'value' in match ? match.value : undefined;
      return [...points.values()]
        .filter((p) => p.payload.projectId === projectId)
        .map((p) => ({ id: p.id, score: cosine(vector, p.vector), payload: p.payload }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit ?? 10);
    },
  } as unknown as QdrantStore;
  return { points, store };
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

const make = (prisma: ReturnType<typeof fakePrisma>, store: QdrantStore) =>
  // biome-ignore lint/suspicious/noExplicitAny: prisma test double.
  new KnowledgeService(prisma as any, new DeterministicEmbeddingProvider(64), store);

describe('KnowledgeService save→search roundtrip', () => {
  it('finds a saved item again through vector search', async () => {
    const prisma = fakePrisma();
    const service = make(prisma, memoryStore().store);

    const saved = await service.save({
      projectId: 'p1',
      title: 'Runtime',
      content: 'We use Bun as the runtime',
    });
    expect(saved.type).toBe('NOTE'); // default type

    const hits = await service.search('p1', 'Bun runtime');
    expect(hits.length).toBe(1);
    expect(hits[0]?.item.id).toBe(saved.id);
    expect(hits[0]?.item.content).toBe('We use Bun as the runtime');
  });

  it('scopes search to the requested projectId', async () => {
    const prisma = fakePrisma();
    const service = make(prisma, memoryStore().store);

    const mine = await service.save({ projectId: 'p1', title: 'A', content: 'shared topic' });
    await service.save({ projectId: 'p2', title: 'B', content: 'shared topic' });

    const hits = await service.search('p1', 'shared topic');
    expect(hits.map((h) => h.item.id)).toEqual([mine.id]);
    expect(hits.every((h) => h.item.projectId === 'p1')).toBe(true);
  });
});

describe('KnowledgeService dual-write compensation', () => {
  it('rolls back the created row when the vector write fails', async () => {
    const prisma = fakePrisma();
    const service = make(prisma, brokenStore());
    await expect(service.save({ projectId: 'p1', title: 'T', content: 'body' })).rejects.toThrow(
      'qdrant down',
    );
    expect(prisma.rows).toHaveLength(0); // no orphaned Postgres row
  });
});
