import { detectIntent, type Intent } from './intent';
import type { SearchService } from './search';

export interface ContextItem {
  path: string;
  symbol: string;
  role: string;
  kind: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

export interface ContextResult {
  query: string;
  intent: Intent;
  items: ContextItem[];
  /** Assembled, budget-bounded context ready to hand to an LLM/MCP client. */
  text: string;
  stats: { candidates: number; included: number; chars: number };
}

export interface BuildContextOptions {
  projectId: string;
  collection: string;
  /** Max symbols to include. */
  limit?: number;
  /** Total character budget for the assembled context. */
  maxChars?: number;
  /** Max lines kept per symbol snippet. */
  snippetLines?: number;
}

/** Keep the first `maxLines` lines of a chunk; mark truncation. */
function compress(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text.trim();
  return `${lines.slice(0, maxLines).join('\n').trim()}\n  // … (${lines.length - maxLines} more lines)`;
}

function render(query: string, intent: Intent, items: ContextItem[]): string {
  const header = `# Context for: "${query}" (intent: ${intent})`;
  const blocks = items.map((it) => {
    const title = `## ${it.path}:${it.startLine} — ${it.role} ${it.symbol} (score ${it.score.toFixed(3)})`;
    return `${title}\n\`\`\`ts\n${it.snippet}\n\`\`\``;
  });
  return [header, ...blocks].join('\n\n');
}

/**
 * Phase 4 Context Engine: query → intent → retrieve → intent-aware re-rank →
 * dedupe → compress → assemble a budget-bounded context block.
 */
export class ContextEngine {
  constructor(private readonly search: Pick<SearchService, 'search'>) {}

  async buildContext(query: string, options: BuildContextOptions): Promise<ContextResult> {
    const limit = options.limit ?? 8;
    const maxChars = options.maxChars ?? 6000;
    const snippetLines = options.snippetLines ?? 24;

    const { intent, roleBoosts } = detectIntent(query);

    const candidates = await this.search.search(query, {
      projectId: options.projectId,
      collection: options.collection,
      limit: limit * 3,
    });

    const reranked = candidates
      .map((c) => ({ ...c, score: c.score * (1 + (roleBoosts[c.role] ?? 0)) }))
      .sort((a, b) => b.score - a.score);

    const items: ContextItem[] = [];
    const seen = new Set<string>();
    let chars = 0;

    for (const c of reranked) {
      if (items.length >= limit) break;
      const key = `${c.path}#${c.symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const snippet = compress(c.text, snippetLines);
      if (items.length > 0 && chars + snippet.length > maxChars) break;

      items.push({
        path: c.path,
        symbol: c.symbol,
        role: c.role,
        kind: c.kind,
        startLine: c.startLine,
        endLine: c.endLine,
        score: c.score,
        snippet,
      });
      chars += snippet.length;
    }

    return {
      query,
      intent,
      items,
      text: render(query, intent, items),
      stats: { candidates: candidates.length, included: items.length, chars },
    };
  }
}
