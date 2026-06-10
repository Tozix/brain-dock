import { QdrantClient } from '@qdrant/js-client-rest';

export type VectorDistance = 'Cosine' | 'Dot' | 'Euclid';

/**
 * Collection layout:
 * - `hybrid` — named dense vector (`dense`) + sparse BM25 vector (`bm25`, idf modifier). All new
 *   collections are created in this format and support server-side RRF fusion.
 * - `legacy` — a single unnamed dense vector (collections created before hybrid search). They keep
 *   working in dense-only mode; reindexing into a fresh collection upgrades them.
 */
export type CollectionMode = 'legacy' | 'hybrid';

/** Named dense vector in hybrid collections. */
export const DENSE_VECTOR = 'dense';
/** Named sparse BM25 vector in hybrid collections. */
export const SPARSE_VECTOR = 'bm25';

/** Sparse vector: parallel `indices`/`values` arrays (Qdrant wire format). */
export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface VectorPoint {
  /** Must be an unsigned integer or a UUID string (Qdrant requirement). */
  id: string;
  /** Dense embedding vector. */
  vector: number[];
  /** Optional BM25 sparse companion — stored as the named `bm25` vector in hybrid collections. */
  sparse?: SparseVector;
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

/** Extract the size of the named `dense` vector config; legacy collections → undefined. */
function denseVectorSize(vectors: unknown): number | undefined {
  if (typeof vectors !== 'object' || vectors === null) return undefined;
  const dense = (vectors as Record<string, unknown>)[DENSE_VECTOR];
  return singleVectorSize(dense);
}

/** Payload fields indexed on every collection — multi-tenant filters must not scan. */
const PAYLOAD_INDEXES: Array<{
  field: string;
  schema: { type: 'keyword'; is_tenant?: boolean };
}> = [
  { field: 'projectId', schema: { type: 'keyword', is_tenant: true } },
  { field: 'repo', schema: { type: 'keyword' } },
  { field: 'path', schema: { type: 'keyword' } },
];

/** Thin, typed wrapper over the Qdrant REST client used by the search/ingest layer. */
export class QdrantStore {
  private readonly client: QdrantClient;
  /** Known collection formats — avoids a getCollection round-trip per operation. */
  private readonly modes = new Map<string, CollectionMode>();

  constructor(options: { url: string; client?: QdrantClient }) {
    this.client =
      options.client ?? new QdrantClient({ url: options.url, checkCompatibility: false });
  }

  /**
   * Create the collection if it does not exist (hybrid format: named dense + sparse BM25 vector);
   * if it does, verify its vector size matches the embedder and detect its format. Legacy
   * collections (single unnamed vector) keep working in dense-only mode. Payload indexes for the
   * tenant filters are created idempotently either way.
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
      const vectors = existing.config?.params?.vectors;
      const existingSize = singleVectorSize(vectors) ?? denseVectorSize(vectors);
      if (existingSize !== undefined && existingSize !== size) {
        throw new Error(
          `Qdrant collection "${name}" has vector size ${existingSize}, but the embedder needs ` +
            `${size} — reindex into a new collection or change COLLECTION`,
        );
      }
      this.modes.set(name, this.detectMode(existing));
    } else {
      try {
        await this.client.createCollection(name, {
          vectors: { [DENSE_VECTOR]: { size, distance } },
          sparse_vectors: { [SPARSE_VECTOR]: { modifier: 'idf' } },
        });
      } catch (error) {
        // Another writer may have created the collection concurrently — that is fine.
        if (!isAlreadyExistsError(error)) throw error;
      }
      this.modes.set(name, 'hybrid');
    }

    await this.ensurePayloadIndexes(name);
  }

  /** Resolve the collection format, caching the answer. Unknown/missing collections → legacy. */
  async collectionMode(name: string): Promise<CollectionMode> {
    const cached = this.modes.get(name);
    if (cached) return cached;
    try {
      const info = await this.client.getCollection(name);
      const mode = this.detectMode(info);
      this.modes.set(name, mode);
      return mode;
    } catch (error) {
      // Missing collection: report legacy without caching — it may be created (hybrid) later.
      if (isNotFoundError(error)) return 'legacy';
      throw error;
    }
  }

  private detectMode(info: { config?: { params?: Record<string, unknown> } }): CollectionMode {
    const params = info.config?.params;
    const dense = denseVectorSize(params?.vectors) !== undefined;
    const sparse =
      typeof params?.sparse_vectors === 'object' &&
      params.sparse_vectors !== null &&
      SPARSE_VECTOR in (params.sparse_vectors as Record<string, unknown>);
    return dense && sparse ? 'hybrid' : 'legacy';
  }

  /** Create the keyword payload indexes; "already exists" responses are swallowed. */
  private async ensurePayloadIndexes(name: string): Promise<void> {
    for (const { field, schema } of PAYLOAD_INDEXES) {
      try {
        await this.client.createPayloadIndex(name, {
          field_name: field,
          field_schema: schema,
          wait: true,
        });
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
      }
    }
  }

  async upsert(name: string, points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    const mode = await this.collectionMode(name);
    // Hybrid collections take named vectors (dense + optional bm25); legacy ones the plain array.
    const mapped = points.map(({ id, vector, sparse, payload }) => ({
      id,
      payload,
      vector:
        mode === 'hybrid'
          ? { [DENSE_VECTOR]: vector, ...(sparse ? { [SPARSE_VECTOR]: sparse } : {}) }
          : vector,
    }));
    await this.client.upsert(name, { wait: true, points: mapped });
  }

  /** Dense-only search. Works against both formats (named `dense` vs unnamed vector). */
  async search(
    name: string,
    vector: number[],
    options: { limit?: number; filter?: QdrantFilter } = {},
  ): Promise<SearchHit[]> {
    const mode = await this.collectionMode(name);
    const result = await this.client.search(name, {
      vector: mode === 'hybrid' ? { name: DENSE_VECTOR, vector } : vector,
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

  /**
   * Hybrid retrieval (hybrid collections only): dense + BM25 prefetches fused server-side with
   * Reciprocal Rank Fusion (Qdrant Query API). Scores are RRF scores, not cosine similarities.
   */
  async hybridQuery(
    name: string,
    options: {
      dense: number[];
      sparse: SparseVector;
      limit?: number;
      /** Candidates fetched per branch before fusion (defaults to `limit`). */
      prefetchLimit?: number;
      filter?: QdrantFilter;
    },
  ): Promise<SearchHit[]> {
    const limit = options.limit ?? 10;
    const prefetchLimit = options.prefetchLimit ?? limit;
    const response = await this.client.query(name, {
      prefetch: [
        {
          query: options.dense,
          using: DENSE_VECTOR,
          limit: prefetchLimit,
          filter: options.filter,
        },
        {
          query: options.sparse,
          using: SPARSE_VECTOR,
          limit: prefetchLimit,
          filter: options.filter,
        },
      ],
      query: { fusion: 'rrf' },
      filter: options.filter,
      limit,
      with_payload: true,
    });
    return response.points.map((hit) => ({
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
    this.modes.delete(name);
  }
}
