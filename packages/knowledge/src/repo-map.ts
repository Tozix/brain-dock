import type { RouteInfo } from '@brain-dock/indexer';

/** One indexed symbol, as needed for ranking + rendering (DB row or in-memory index shape). */
export interface RepoMapSymbol {
  repo: string;
  name: string;
  kind: string;
  role: string;
  file: string;
  startLine: number;
  routes?: RouteInfo[];
}

/** A directed dependency edge between symbol names (`from` depends on `to`). */
export interface RepoMapEdge {
  from: string;
  to: string;
}

export interface BuildRepoMapOptions {
  symbols: RepoMapSymbol[];
  edges: RepoMapEdge[];
  /** Bias the ranking toward symbols whose name/file matches these query tokens. */
  seedQuery?: string;
  /** Approximate output cap; tokens ≈ chars / 4 (default {@link DEFAULT_REPO_MAP_TOKENS}). */
  tokenBudget?: number;
  /** When true, a note is added that the symbol set was truncated upstream for safety. */
  truncated?: boolean;
}

export const DEFAULT_REPO_MAP_TOKENS = 2000;

const DAMPING = 0.85;
const PAGERANK_ITERATIONS = 25;
const CHARS_PER_TOKEN = 4;

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function renderLine(s: RepoMapSymbol, multiRepo: boolean): string {
  const loc = multiRepo && s.repo ? `${s.repo}/${s.file}` : s.file;
  const role = s.role && s.role !== 'none' ? ` (${s.role})` : '';
  const routes =
    s.routes && s.routes.length > 0
      ? `  routes: ${s.routes
          .map((r) => `${r.method.toUpperCase()} ${r.path || '/'} → ${r.handler}`)
          .join('; ')}`
      : '';
  return `${loc}:${s.startLine} ${s.kind} ${s.name}${role}${routes}`;
}

function header(shown: number, total: number, seeded: boolean, truncated?: boolean): string {
  const seed = seeded ? ', biased toward the query' : '';
  const note = truncated ? ' (symbol set truncated for ranking)' : '';
  return `Repo map — top ${shown} of ${total} symbols by dependency centrality${seed}${note}:`;
}

/**
 * Build a token-budgeted "map" of a repository (à la Aider): rank symbols with Personalized
 * PageRank over the name-level dependency graph (edge `from → to` = "from depends on to", so
 * heavily-depended-upon symbols rank high), optionally concentrating the teleport vector on
 * symbols matching `seedQuery`, then render as many top lines as fit the budget.
 *
 * Pure function — no I/O; callers load symbols/edges from Postgres or the in-memory index.
 */
export function buildRepoMap(options: BuildRepoMapOptions): string {
  const { symbols, edges, seedQuery } = options;
  const tokenBudget = options.tokenBudget ?? DEFAULT_REPO_MAP_TOKENS;
  if (symbols.length === 0) return 'No symbols to map — index a repository first.';

  // One ranking node per symbol *name* (edges reference names, mirroring SymbolGraph).
  const nameToIdx = new Map<string, number>();
  const searchText: string[] = []; // per node: lowercase name + file paths, for seed matching
  for (const s of symbols) {
    let idx = nameToIdx.get(s.name);
    if (idx === undefined) {
      idx = nameToIdx.size;
      nameToIdx.set(s.name, idx);
      searchText.push('');
    }
    searchText[idx] = `${searchText[idx] ?? ''} ${s.name.toLowerCase()} ${s.file.toLowerCase()}`;
  }
  const n = nameToIdx.size;

  // Adjacency restricted to known symbols — external references don't soak up rank.
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    const from = nameToIdx.get(e.from);
    const to = nameToIdx.get(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    out[from]?.push(to);
  }

  // Teleport vector: uniform, or concentrated on the seed-query matches when there are any.
  const teleport = new Array<number>(n).fill(1 / n);
  const tokens = seedQuery ? tokenize(seedQuery) : [];
  let seeded = false;
  if (tokens.length > 0) {
    const seeds: number[] = [];
    for (let i = 0; i < n; i++) {
      const hay = searchText[i] ?? '';
      if (tokens.some((t) => hay.includes(t))) seeds.push(i);
    }
    if (seeds.length > 0 && seeds.length < n) {
      teleport.fill(0);
      for (const i of seeds) teleport[i] = 1 / seeds.length;
      seeded = true;
    }
  }

  // Personalized PageRank; dangling mass is redistributed along the teleport vector.
  let rank = teleport.slice();
  for (let iter = 0; iter < PAGERANK_ITERATIONS; iter++) {
    const next = teleport.map((t) => (1 - DAMPING) * t);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      const targets = out[i] ?? [];
      const mass = rank[i] ?? 0;
      if (targets.length === 0) {
        dangling += mass;
        continue;
      }
      const share = (DAMPING * mass) / targets.length;
      for (const j of targets) next[j] = (next[j] ?? 0) + share;
    }
    if (dangling > 0) {
      for (let i = 0; i < n; i++) {
        next[i] = (next[i] ?? 0) + DAMPING * dangling * (teleport[i] ?? 0);
      }
    }
    rank = next;
  }

  const multiRepo = new Set(symbols.map((s) => s.repo)).size > 1;
  const lines = symbols
    .map((s) => ({ s, score: rank[nameToIdx.get(s.name) ?? -1] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .map(({ s }) => renderLine(s, multiRepo));

  // Binary-search the largest line count whose full rendering fits the character budget.
  const budgetChars = tokenBudget * CHARS_PER_TOKEN;
  const render = (count: number) =>
    [header(count, symbols.length, seeded, options.truncated), ...lines.slice(0, count)].join('\n');
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (render(mid).length <= budgetChars) lo = mid;
    else hi = mid - 1;
  }
  return render(lo);
}
