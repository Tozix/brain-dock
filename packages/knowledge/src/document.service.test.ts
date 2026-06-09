import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantFilter, QdrantStore, VectorPoint } from '@brain-dock/storage';
import { DocumentService } from './document.service';

type Doc = {
  id: string;
  projectId: string;
  title: string;
  format: string;
  source: string | null;
  content: string;
};

function fakePrisma(seed: Doc[]) {
  const rows = [...seed];
  return {
    rows,
    document: {
      findFirst: async ({ where }: { where: { id: string; projectId: string } }) =>
        rows.find((r) => r.id === where.id && r.projectId === where.projectId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Doc> }) => {
        const row = rows.find((r) => r.id === where.id) as Doc;
        Object.assign(row, data);
        return row;
      },
    },
  };
}

/** Records upserts and delete-by-documentId so tests can assert vector replacement. */
function fakeStore() {
  const upserts: VectorPoint[][] = [];
  const dropped: string[] = [];
  const store = {
    ensureCollection: async () => {},
    upsert: async (_n: string, points: VectorPoint[]) => void upserts.push(points),
    deleteByFilter: async (_n: string, filter: QdrantFilter) => {
      const cond = filter.must?.find((m) => m.key === 'documentId')?.match;
      if (cond && 'value' in cond) dropped.push(String(cond.value));
    },
    search: async () => [],
  };
  return { store: store as unknown as QdrantStore, upserts, dropped };
}

const doc = (over: Partial<Doc> = {}): Doc => ({
  id: 'd1',
  projectId: 'p1',
  title: 'Doc',
  format: 'MD',
  source: null,
  content: 'hello world',
  ...over,
});

describe('DocumentService.update', () => {
  it('returns null for a document outside the project', async () => {
    const { store } = fakeStore();
    // biome-ignore lint/suspicious/noExplicitAny: prisma test double.
    const svc = new DocumentService(
      fakePrisma([doc()]) as any,
      new DeterministicEmbeddingProvider(64),
      store,
    );
    expect(await svc.update('other', 'd1', { title: 'X' })).toBeNull();
  });

  it('updates title only without dropping or re-embedding vectors', async () => {
    const { store, upserts, dropped } = fakeStore();
    // biome-ignore lint/suspicious/noExplicitAny: prisma test double.
    const svc = new DocumentService(
      fakePrisma([doc()]) as any,
      new DeterministicEmbeddingProvider(64),
      store,
    );
    const res = await svc.update('p1', 'd1', { title: 'Renamed' });
    expect(res?.document.title).toBe('Renamed');
    expect(dropped).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it('re-extracts, drops old vectors and re-embeds when content changes', async () => {
    const { store, upserts, dropped } = fakeStore();
    // biome-ignore lint/suspicious/noExplicitAny: prisma test double.
    const svc = new DocumentService(
      fakePrisma([doc()]) as any,
      new DeterministicEmbeddingProvider(64),
      store,
    );
    const res = await svc.update('p1', 'd1', { content: 'completely new body text' });
    expect(res?.document.content).toBe('completely new body text');
    expect(res?.chunks).toBeGreaterThan(0);
    expect(dropped).toEqual(['d1']); // old vectors dropped before re-embedding
    expect(upserts.length).toBe(1);
    expect(upserts[0]?.[0]?.payload.documentId).toBe('d1');
  });
});
