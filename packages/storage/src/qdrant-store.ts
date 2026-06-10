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

/** True for errors meaning "the resource does not exist" (HTTP 404 / "Not found"). */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, message } = error as { status?: unknown; message?: unknown };
  if (status === 404) return true;
  return typeof message === 'string' && /not found/i.test(message);
}

function isAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, message } = error as { status?: unknown; message?: unknown };
  if (status === 409) return true;
  return typeof message === 'string' && /already exists/i.test(message);
}

/** Extract the size of a single (unnamed) vector config; named-vector collections → undefined. */
function singleVectorSize(vectors: unknown): number | undefined {
  if (typeof vectors !== 'object' || vectors === null) return undefined;
  const size = (vectors as { size?: unknown }).size;
  return typeof size === 'number' ? size : undefined;
}

/** Thin, typed wrapper over the Qdrant REST client used by the search/ingest layer. */
export class QdrantStore {
  private readonly client: QdrantClient;

  constructor(options: { url: string; client?: QdrantClient }) {
    this.client =
      options.client ?? new QdrantClient({ url: options.url, checkCompatibility: false });
  }

  /**
   * Create the collection if it does not exist; if it does, verify its vector size matches the
   * embedder. Network/server errors propagate instead of being mistaken for a missing collection.
   */
  async ensureCollection(
    name: string,
    size: number,
    distance: VectorDistance = 'Cosine',
  ): Promise<void> {
    let existing: Awaited<ReturnType<QdrantClient['getCollection']>> | undefined;
    try {
      existing = await this.client.getCollection(name);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    if (existing) {
      const existingSize = singleVectorSize(existing.config?.params?.vectors);
      if (existingSize !== undefined && existingSize !== size) {
        throw new Error(
          `Qdrant collection "${name}" has vector size ${existingSize}, but the embedder needs ` +
            `${size} — reindex into a new collection or change COLLECTION`,
        );
      }
      return;
    }

    try {
      await this.client.createCollection(name, { vectors: { size, distance } });
    } catch (error) {
      // Another writer may have created the collection concurrently — that is fine.
      if (!isAlreadyExistsError(error)) throw error;
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

  /** List all point ids matching the filter — scrolls in batches, no payload/vectors fetched. */
  async listPointIds(
    name: string,
    options: { filter?: QdrantFilter; batchSize?: number } = {},
  ): Promise<string[]> {
    const limit = options.batchSize ?? 1024;
    const ids: string[] = [];
    let offset: string | number | undefined;
    do {
      const page = await this.client.scroll(name, {
        filter: options.filter,
        limit,
        offset,
        with_payload: false,
        with_vector: false,
      });
      for (const point of page.points) ids.push(String(point.id));
      offset = (page.next_page_offset ?? undefined) as string | number | undefined;
    } while (offset !== undefined);
    return ids;
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
