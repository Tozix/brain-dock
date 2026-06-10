import { describe, expect, it } from 'bun:test';
import type { EmbeddingProvider } from '@brain-dock/embedding';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantFilter, QdrantStore, SearchHit, VectorPoint } from '@brain-dock/storage';
import { EmbeddedIndex } from './embedded-index';

/** Embedder spy distinguishing document (`embed`) from query (`embedQuery`) calls. */
class SpyEmbedder implements EmbeddingProvider {
  readonly model = 'spy';
  readonly dimensions = 8;
  embedCalls: string[][] = [];
  queryCalls: string[] = [];
  private readonly inner = new DeterministicEmbeddingProvider(8);

  async embed(texts: string[]): Promise<number[][]> {
    this.embedCalls.push(texts);
    return this.inner.embed(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    this.queryCalls.push(text);
    return this.inner.embedQuery(text);
  }
}

class FakeStore {
  upserted: VectorPoint[] = [];
  searches: Array<{ vector: number[]; filter?: QdrantFilter; limit?: number }> = [];
  hits: SearchHit[] = [];
  async ensureCollection(): Promise<void> {}
  async upsert(_name: string, points: VectorPoint[]): Promise<void> {
    this.upserted.push(...points);
  }
  async deletePoints(): Promise<void> {
    throw new Error('Not found: collection memory');
  }
  async search(
    _name: string,
    vector: number[],
    options: { limit?: number; filter?: QdrantFilter } = {},
  ): Promise<SearchHit[]> {
    this.searches.push({ vector, ...options });
    return this.hits;
  }
}

function setup() {
  const embedder = new SpyEmbedder();
  const store = new FakeStore();
  const index = new EmbeddedIndex(embedder, store as unknown as QdrantStore, 'memory');
  return { embedder, store, index };
}

describe('EmbeddedIndex', () => {
  it('upserts records as documents (embed) with the given payload', async () => {
    const { embedder, store, index } = setup();
    await index.upsert('id-1', 'we run on Bun', { projectId: 'p' });

    expect(embedder.embedCalls).toEqual([['we run on Bun']]);
    expect(embedder.queryCalls).toHaveLength(0);
    expect(store.upserted).toHaveLength(1);
    expect(store.upserted[0]?.id).toBe('id-1');
    expect(store.upserted[0]?.payload).toEqual({ projectId: 'p' });
  });

  it('searches with embedQuery (query-side embedding) and a projectId filter', async () => {
    const { embedder, store, index } = setup();
    store.hits = [{ id: 'id-1', score: 0.9, payload: { projectId: 'p' } }];

    const hits = await index.search('runtime choice', 'p', 5);

    expect(embedder.queryCalls).toEqual(['runtime choice']);
    expect(embedder.embedCalls).toHaveLength(0);
    expect(store.searches[0]?.limit).toBe(5);
    expect(store.searches[0]?.filter).toEqual({
      must: [{ key: 'projectId', match: { value: 'p' } }],
    });
    expect(hits).toHaveLength(1);
  });

  it('delete tolerates a missing collection', async () => {
    const { index } = setup();
    await expect(index.delete('id-1')).resolves.toBeUndefined();
  });
});
