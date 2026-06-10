import type { EmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantFilter, QdrantStore } from '@brain-dock/storage';
import { bm25QueryVector, tokenizeCode } from './tokenize';
import type { ChunkPayload, SearchResult } from './types';

export interface QueryOptions {
  projectId: string;
  collection: string;
  limit?: number;
  /** Restrict to a subset of repository aliases. Omit/empty = all repos in the project. */
  repos?: string[];
}

const VECTOR_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;
/** Dense candidates over-fetched for client-side re-ranking (legacy) / per-branch prefetch (hybrid). */
const CANDIDATE_FACTOR = 3;

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
}

/** Fraction of query tokens present in the candidate text. */
function keywordScore(queryTokens: Set<string>, text: string): number {
  if (queryTokens.size === 0) return 0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) hits++;
  }
  return hits / queryTokens.size;
}

/**
 * Hybrid retrieval. On hybrid collections: dense + BM25 sparse vectors fused server-side with RRF
 * (Qdrant Query API) — BM25 covers exact-identifier matching, so no client-side keyword boost is
 * applied. On legacy collections (single unnamed vector): dense search blended with a lightweight
 * substring-overlap keyword score, exactly as before.
 */
export class SearchService {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: Pick<QdrantStore, 'search' | 'hybridQuery' | 'collectionMode'>,
  ) {}

  async search(query: string, options: QueryOptions): Promise<SearchResult[]> {
    const limit = options.limit ?? 10;
    const queryVector = await this.embedder.embedQuery(query);

    const filter: QdrantFilter = {
      must: [{ key: 'projectId', match: { value: options.projectId } }],
    };
    if (options.repos && options.repos.length > 0) {
      filter.must?.push({ key: 'repo', match: { any: options.repos } });
    }

    const mode = await this.store.collectionMode(options.collection);
    const sparse = bm25QueryVector(tokenizeCode(query));
    if (mode === 'hybrid' && sparse.indices.length > 0) {
      const hits = await this.store.hybridQuery(options.collection, {
        dense: queryVector,
        sparse,
        limit,
        prefetchLimit: limit * CANDIDATE_FACTOR,
        filter,
      });
      return hits.map((hit) => ({ ...(hit.payload as unknown as ChunkPayload), score: hit.score }));
    }

    const hits = await this.store.search(options.collection, queryVector, {
      limit: limit * CANDIDATE_FACTOR,
      filter,
    });

    const queryTokens = tokenize(query);
    return hits
      .map((hit) => {
        const payload = hit.payload as unknown as ChunkPayload;
        const keyword = keywordScore(
          queryTokens,
          `${payload.symbol} ${payload.path} ${payload.text}`,
        );
        return { ...payload, score: VECTOR_WEIGHT * hit.score + KEYWORD_WEIGHT * keyword };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
