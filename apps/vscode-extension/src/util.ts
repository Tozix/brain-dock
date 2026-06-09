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
  repos: string[];
  roles: Record<string, number>;
}

/** Strip trailing slashes from a base URL so path joins stay clean. */
export function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
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
  const status: IndexStatus = { files: 0, symbols: 0, repos: [], roles: {} };
  const repos = text.match(/^Repositories \(\d+\):\s*(.+)$/m);
  if (repos?.[1]) {
    status.repos = repos[1]
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }
  const files = text.match(/^Files:\s*(\d+)/m);
  if (files?.[1]) status.files = Number(files[1]);
  const symbols = text.match(/^Symbols:\s*(\d+)/m);
  if (symbols?.[1]) status.symbols = Number(symbols[1]);
  for (const m of text.matchAll(/^\s{2}([a-zA-Z]+):\s*(\d+)$/gm)) {
    if (m[1] && m[2]) status.roles[m[1]] = Number(m[2]);
  }
  return status;
}
