import { QdrantClient } from '@qdrant/js-client-rest';

export type VectorDistance = 'Cosine' | 'Dot' | 'Euclid';

export interface VectorPoint {
  /** Must be an unsigned integer or a UUID string (Qdrant requirement). */
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchHit {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

/** A single match condition: an exact value, or "any of" a set (Qdrant `match.any`). */
export type QdrantMatch = { value: string | number | boolean } | { any: Array<string | number> };

export interface QdrantFilter {
  must?: Array<{ key: string; match: QdrantMatch }>;
}

/** Thin, typed wrapper over the Qdrant REST client used by the search/ingest layer. */
export class QdrantStore {
  private readonly client: QdrantClient;

  constructor(options: { url: string }) {
    this.client = new QdrantClient({ url: options.url, checkCompatibility: false });
  }

  /** Create the collection if it does not already exist. */
  async ensureCollection(
    name: string,
    size: number,
    distance: VectorDistance = 'Cosine',
  ): Promise<void> {
    try {
      await this.client.getCollection(name);
    } catch {
      await this.client.createCollection(name, { vectors: { size, distance } });
    }
  }

  async upsert(name: string, points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert(name, { wait: true, points });
  }

  async search(
    name: string,
    vector: number[],
    options: { limit?: number; filter?: QdrantFilter } = {},
  ): Promise<SearchHit[]> {
    const result = await this.client.search(name, {
      vector,
      limit: options.limit ?? 10,
      filter: options.filter,
      with_payload: true,
    });
    return result.map((hit) => ({
      id: String(hit.id),
      score: hit.score,
      payload: (hit.payload ?? {}) as Record<string, unknown>,
    }));
  }

  async deletePoints(name: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.client.delete(name, { wait: true, points: ids });
  }

  async deleteByFilter(name: string, filter: QdrantFilter): Promise<void> {
    await this.client.delete(name, { wait: true, filter });
  }

  async deleteCollection(name: string): Promise<void> {
    await this.client.deleteCollection(name);
  }
}
