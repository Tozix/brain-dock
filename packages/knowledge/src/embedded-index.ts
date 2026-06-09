import type { EmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantStore, SearchHit } from '@brain-dock/storage';

/**
 * Backs a Postgres-owned record set with a Qdrant collection for semantic search.
 * Point id = the record's UUID (valid Qdrant id), so vector and row stay in sync.
 */
export class EmbeddedIndex {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: QdrantStore,
    private readonly collection: string,
  ) {}

  private ensure(): Promise<void> {
    return this.store.ensureCollection(this.collection, this.embedder.dimensions);
  }

  async upsert(id: string, text: string, payload: Record<string, unknown>): Promise<void> {
    await this.ensure();
    const [vector] = await this.embedder.embed([text]);
    if (!vector) return;
    await this.store.upsert(this.collection, [{ id, vector, payload }]);
  }

  async search(query: string, projectId: string, limit: number): Promise<SearchHit[]> {
    await this.ensure();
    const [vector] = await this.embedder.embed([query]);
    if (!vector) return [];
    return this.store.search(this.collection, vector, {
      limit,
      filter: { must: [{ key: 'projectId', match: { value: projectId } }] },
    });
  }
}
