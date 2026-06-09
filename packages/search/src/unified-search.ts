import type { SearchService } from './search';

export type UnifiedSource = 'code' | 'memory' | 'knowledge' | 'document';

export interface UnifiedResult {
  source: UnifiedSource;
  /** Cross-source rank score: each source min-max normalized to [0,1] (see UnifiedSearchService). */
  score: number;
  /** The source's own raw score (cosine / hybrid) before normalization. */
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

/** A unified result before cross-source normalization (carries only its source's raw score). */
type RawResult = Omit<UnifiedResult, 'score'>;

/**
 * Min-max normalize each source's scores to [0,1] so no source dominates merely because its
 * score scale is larger. A source whose hits are all equal (or single) maps to 1.0; ranking
 * then falls back to the raw score as a tie-break, keeping more-confident hits ahead.
 */
function normalizeBySource(groups: RawResult[][]): UnifiedResult[] {
  const out: UnifiedResult[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const scores = group.map((r) => r.rawScore);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const span = max - min;
    for (const r of group) {
      out.push({ ...r, score: span > 0 ? (r.rawScore - min) / span : 1 });
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
      this.sources.code
        .search(query, {
          projectId,
          collection: options.codeCollection ?? 'code',
          repos: options.repos,
          limit,
        })
        .catch(() => []),
      this.sources.memory.search(projectId, query, limit).catch(() => []),
      this.sources.knowledge.search(projectId, query, limit).catch(() => []),
      this.sources.documents.search(projectId, query, limit).catch(() => []),
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

    // Rank by normalized score; break ties with the raw score so confident hits stay ahead.
    return normalizeBySource(groups)
      .sort((a, b) => b.score - a.score || b.rawScore - a.rawScore)
      .slice(0, limit);
  }
}
