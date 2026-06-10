import type { SearchService } from './search';

export type UnifiedSource = 'code' | 'memory' | 'knowledge' | 'document';

export interface UnifiedResult {
  source: UnifiedSource;
  /** Cross-source rank score: weighted Reciprocal Rank Fusion, `w_src / (60 + rank)` (rank ≥ 1). */
  score: number;
  /** The source's own raw score (cosine / hybrid) before fusion. */
  rawScore: number;
  title: string;
  snippet: string;
  /** Locator: `path:line` for code, record id otherwise. */
  ref: string;
}

export interface UnifiedQuery {
  projectId: string;
  codeCollection?: string;
  /** Restrict the code source to a subset of repository aliases. Omit/empty = all repos. */
  repos?: string[];
  limit?: number;
}

// Structural shapes of the knowledge/memory/document searchers (no package dependency).
interface MemoryHitLike {
  score: number;
  item: { id: string; type: string; content: string };
}
interface KnowledgeHitLike {
  score: number;
  item: { id: string; type: string; title: string; content: string };
}
interface DocumentHitLike {
  score: number;
  document: { id: string; title: string; format: string; content: string };
}

export interface UnifiedSources {
  code: Pick<SearchService, 'search'>;
  memory: { search(projectId: string, query: string, limit?: number): Promise<MemoryHitLike[]> };
  knowledge: {
    search(projectId: string, query: string, limit?: number): Promise<KnowledgeHitLike[]>;
  };
  documents: {
    search(projectId: string, query: string, limit?: number): Promise<DocumentHitLike[]>;
  };
}

function snippet(text: string, max = 160): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Degrade a failing source to no results, but leave a trace in the logs. */
function emptyOnFailure<T>(source: UnifiedSource, promise: Promise<T[]>): Promise<T[]> {
  return promise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[unified-search] source ${source} failed:`, message);
    return [];
  });
}

/** A unified result before cross-source fusion (carries only its source's raw score). */
type RawResult = Omit<UnifiedResult, 'score'>;

/** RRF dampening constant — the standard k=60 keeps deep ranks from vanishing entirely. */
const RRF_K = 60;

/** Source priors: code answers most queries; memory is the most situational. */
const SOURCE_WEIGHTS: Record<UnifiedSource, number> = {
  code: 1.0,
  knowledge: 0.9,
  document: 0.8,
  memory: 0.7,
};

/**
 * Weighted Reciprocal Rank Fusion: within each source, hits are ranked by their raw score and
 * scored `w_src / (RRF_K + rank)` (rank starts at 1). Unlike min-max normalization, a source's
 * single/equal-scored hit no longer jumps to 1.0 — only its *rank* and the source prior matter,
 * so raw score scales never have to be comparable across sources.
 */
function rrfBySource(groups: RawResult[][]): UnifiedResult[] {
  const out: UnifiedResult[] = [];
  for (const group of groups) {
    const ranked = [...group].sort((a, b) => b.rawScore - a.rawScore);
    for (let i = 0; i < ranked.length; i++) {
      const result = ranked[i];
      if (!result) continue;
      out.push({ ...result, score: SOURCE_WEIGHTS[result.source] / (RRF_K + i + 1) });
    }
  }
  return out;
}

/**
 * `search_everywhere`: one query across code + memory + knowledge + documents,
 * merged into a single ranked list. A failing source (e.g. an un-ingested collection)
 * contributes no results instead of failing the whole query.
 */
export class UnifiedSearchService {
  constructor(private readonly sources: UnifiedSources) {}

  async search(query: string, options: UnifiedQuery): Promise<UnifiedResult[]> {
    const { projectId } = options;
    const limit = options.limit ?? 10;

    const [code, memory, knowledge, documents] = await Promise.all([
      emptyOnFailure(
        'code',
        this.sources.code.search(query, {
          projectId,
          collection: options.codeCollection ?? 'code',
          repos: options.repos,
          limit,
        }),
      ),
      emptyOnFailure('memory', this.sources.memory.search(projectId, query, limit)),
      emptyOnFailure('knowledge', this.sources.knowledge.search(projectId, query, limit)),
      emptyOnFailure('document', this.sources.documents.search(projectId, query, limit)),
    ]);

    const groups: RawResult[][] = [
      code.map((c) => ({
        source: 'code' as const,
        rawScore: c.score,
        title: `${c.role} ${c.symbol}`,
        snippet: snippet(c.text),
        ref: `${c.path}:${c.startLine}`,
      })),
      memory.map((m) => ({
        source: 'memory' as const,
        rawScore: m.score,
        title: m.item.type,
        snippet: snippet(m.item.content),
        ref: m.item.id,
      })),
      knowledge.map((k) => ({
        source: 'knowledge' as const,
        rawScore: k.score,
        title: k.item.title,
        snippet: snippet(k.item.content),
        ref: k.item.id,
      })),
      documents.map((d) => ({
        source: 'document' as const,
        rawScore: d.score,
        title: d.document.title,
        snippet: snippet(d.document.content),
        ref: d.document.id,
      })),
    ];

    // Rank by fused score; break ties with the raw score so confident hits stay ahead.
    return rrfBySource(groups)
      .sort((a, b) => b.score - a.score || b.rawScore - a.rawScore)
      .slice(0, limit);
  }
}
