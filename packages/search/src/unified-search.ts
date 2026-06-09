import type { SearchService } from './search';

export type UnifiedSource = 'code' | 'memory' | 'knowledge' | 'document';

export interface UnifiedResult {
  source: UnifiedSource;
  score: number;
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

    const results: UnifiedResult[] = [
      ...code.map((c) => ({
        source: 'code' as const,
        score: c.score,
        title: `${c.role} ${c.symbol}`,
        snippet: snippet(c.text),
        ref: `${c.path}:${c.startLine}`,
      })),
      ...memory.map((m) => ({
        source: 'memory' as const,
        score: m.score,
        title: m.item.type,
        snippet: snippet(m.item.content),
        ref: m.item.id,
      })),
      ...knowledge.map((k) => ({
        source: 'knowledge' as const,
        score: k.score,
        title: k.item.title,
        snippet: snippet(k.item.content),
        ref: k.item.id,
      })),
      ...documents.map((d) => ({
        source: 'document' as const,
        score: d.score,
        title: d.document.title,
        snippet: snippet(d.document.content),
        ref: d.document.id,
      })),
    ];

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
