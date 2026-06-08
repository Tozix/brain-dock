import type { EmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantStore } from '@brain-dock/storage';
import type { ChunkPayload, SearchResult } from './types';

export interface QueryOptions {
  projectId: string;
  collection: string;
  limit?: number;
}

const VECTOR_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

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
 * Hybrid retrieval (bridge implementation): vector similarity from Qdrant blended
 * with a lightweight keyword overlap score. Full BM25/AST/knowledge fusion is Phase 4.
 */
export class SearchService {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: Pick<QdrantStore, 'search'>,
  ) {}

  async search(query: string, options: QueryOptions): Promise<SearchResult[]> {
    const limit = options.limit ?? 10;
    const vectors = await this.embedder.embed([query]);
    const queryVector = vectors[0];
    if (!queryVector) throw new Error('Failed to embed query');

    const hits = await this.store.search(options.collection, queryVector, {
      limit: limit * 3,
      filter: { must: [{ key: 'projectId', match: { value: options.projectId } }] },
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
