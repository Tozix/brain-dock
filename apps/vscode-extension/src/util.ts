// Pure helpers shared across the extension — no `vscode` import, so they are unit-testable under Bun.

export interface Project {
  id: string;
  name: string;
  slug: string;
}

export interface Repository {
  id: string;
  name: string;
  alias: string;
  root: string;
  updatedAt?: string;
}

export interface IndexStatus {
  files: number;
  symbols: number;
  edges: number;
  repos: string[];
  roles: Record<string, number>;
}

export interface FileContent {
  path: string;
  content: string;
}

/** Indexing lifecycle of one repository (REST `GET .../repositories/:id/status`). */
export interface RepoStatus {
  indexStatus: 'QUEUED' | 'INDEXING' | 'READY' | 'FAILED' | null;
  indexError: string | null;
  indexedFileCount: number | null;
  symbolCount: number | null;
  lastIndexedAt: string | null;
  updatedAt?: string;
}

export interface UsageSummary {
  days: number;
  calls: number;
  tokensServed: number;
}

/** Total upload budget for one workspace index run (sum of file sizes). */
export const UPLOAD_BUDGET_BYTES = 40 * 1024 * 1024;
/** Per-file size cap — bigger files are generated/bundled artifacts, not source. */
export const MAX_FILE_BYTES = 512 * 1024;

/** Strip trailing slashes from a base URL so path joins stay clean. */
export function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Find a project by slug or id. */
export function findProject(projects: Project[], key: string): Project | undefined {
  return projects.find((p) => p.slug === key || p.id === key);
}

/**
 * Pick the project to (re)use: the configured one if it still exists, else one matching the
 * folder-name slug. Returns undefined when a new project must be created.
 */
export function pickProject(
  projects: Project[],
  configured: string | undefined,
  slug: string,
): Project | undefined {
  return (
    (configured ? findProject(projects, configured) : undefined) ?? findProject(projects, slug)
  );
}

/** Skip declaration files and minified/bundled artifacts — noise for the index. */
export function isIndexablePath(rel: string): boolean {
  return !rel.endsWith('.d.ts') && !rel.endsWith('.min.js');
}

/**
 * Decide what to do with a candidate upload given the bytes collected so far:
 * `skip` (non-indexable or oversized file), `stop` (shared budget exhausted) or `add`.
 */
export function classifyUpload(
  rel: string,
  bytes: number,
  totalBytes: number,
  budgetBytes: number = UPLOAD_BUDGET_BYTES,
  maxFileBytes: number = MAX_FILE_BYTES,
): 'add' | 'skip' | 'stop' {
  if (!isIndexablePath(rel) || bytes > maxFileBytes) return 'skip';
  if (totalBytes + bytes > budgetBytes) return 'stop';
  return 'add';
}

/** Turn a folder name into a server-safe slug/alias (`^[a-z0-9-]+$`). Falls back to "workspace". */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || 'workspace';
}

interface JsonRpcReply {
  result?: { content?: Array<{ text?: string }> };
  error?: { message: string };
}

/** Parse a JSON-RPC reply that may arrive as plain JSON or inside an SSE `data:` stream. */
export function parseJsonRpc(raw: string): JsonRpcReply {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as JsonRpcReply;
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^data:\s*(.+)$/);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as JsonRpcReply;
      } catch {
        // SSE frames can interleave comments/heartbeats — keep scanning.
      }
    }
  }
  throw new Error('Unparseable MCP response');
}

/** Extract the text payload of an MCP tool result, or throw on a JSON-RPC error. */
export function toolText(raw: string): string {
  const msg = parseJsonRpc(raw);
  if (msg.error) throw new Error(msg.error.message);
  return msg.result?.content?.[0]?.text ?? '';
}

/** Parse the human-readable `summarize_project` text into structured counts. */
export function parseSummary(text: string): IndexStatus {
  const status: IndexStatus = { files: 0, symbols: 0, edges: 0, repos: [], roles: {} };
  const repos = text.match(/^Repositories \((\d+)\):\s*(.+)$/m);
  // Trust the count in parentheses: "(0): (none — reindex first)" must not yield a fake repo name.
  if (repos?.[1] && repos[2] && Number(repos[1]) > 0) {
    status.repos = repos[2]
      .split(',')
      .map((r) => r.trim())
      .filter((r) => /^[A-Za-z0-9._-]+$/.test(r));
  }
  const files = text.match(/^Files:\s*(\d+)/m);
  if (files?.[1]) status.files = Number(files[1]);
  const symbols = text.match(/^Symbols:\s*(\d+)/m);
  if (symbols?.[1]) status.symbols = Number(symbols[1]);
  const edges = text.match(/^Edges:\s*(\d+)/m);
  if (edges?.[1]) status.edges = Number(edges[1]);
  for (const m of text.matchAll(/^\s{2}([a-zA-Z]+):\s*(\d+)$/gm)) {
    if (m[1] && m[2]) status.roles[m[1]] = Number(m[2]);
  }
  return status;
}
