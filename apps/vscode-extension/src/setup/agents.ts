// Setup Agents: write the brain-dock remote MCP into AI-agent configs. Claude Code reads
// `.mcp.json` (project) / `~/.claude.json` (user); Cursor reads `.cursor/mcp.json` (project) /
// `~/.cursor/mcp.json` (user). Pure builders/mergers are unit-tested; only I/O touches the disk.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type AgentTarget = 'claude-project' | 'claude-global' | 'cursor-project' | 'cursor-global';

export interface McpServerConfig {
  serverName: string;
  mcpUrl: string;
  apiKey: string;
  project: string;
}

export interface ServerEntry {
  type?: string;
  url: string;
  headers: Record<string, string>;
}

/** Build the MCP server entry. Claude Code wants `type: "http"`; Cursor infers it from `url`. */
export function buildServerEntry(cfg: McpServerConfig, withType: boolean): ServerEntry {
  const entry: ServerEntry = {
    url: cfg.mcpUrl,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'X-Project': cfg.project },
  };
  if (withType) entry.type = 'http';
  return entry;
}

/** Merge a server entry into an existing config object, preserving everything else. */
export function mergeMcpConfig(
  existing: Record<string, unknown>,
  name: string,
  entry: ServerEntry,
): Record<string, unknown> {
  const servers = (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
  return { ...existing, mcpServers: { ...servers, [name]: entry } };
}

/** Config file path for a target. Project targets need a workspace root (else undefined). */
export function configPathFor(
  target: AgentTarget,
  workspaceRoot: string | undefined,
  home: string = os.homedir(),
): string | undefined {
  switch (target) {
    case 'claude-project':
      return workspaceRoot ? path.join(workspaceRoot, '.mcp.json') : undefined;
    case 'claude-global':
      return path.join(home, '.claude.json');
    case 'cursor-project':
      return workspaceRoot ? path.join(workspaceRoot, '.cursor', 'mcp.json') : undefined;
    case 'cursor-global':
      return path.join(home, '.cursor', 'mcp.json');
  }
}

/**
 * Read + parse a JSON config. Missing or empty files yield `{}`; an existing file that does not
 * parse to a JSON object throws — we must never silently replace a user's config with `{}`.
 */
export function readJsonSafe(file: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${file} exists but is not valid JSON — fix or back it up first (not overwriting it).`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} does not contain a JSON object — not overwriting it.`);
  }
  return parsed as Record<string, unknown>;
}

/** Atomic write (tmp + rename) so a crash can't truncate the config; new files are 0o600 (API key inside). */
function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let mode = 0o600;
  try {
    mode = fs.statSync(file).mode & 0o777; // preserve existing permissions
  } catch {
    // new file — keep the restrictive default
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Write the brain-dock server into the target's config, returning the file path written. */
export function applyTarget(
  target: AgentTarget,
  cfg: McpServerConfig,
  workspaceRoot: string | undefined,
): string {
  const file = configPathFor(target, workspaceRoot);
  if (!file) throw new Error('Open a workspace folder to write a project-scoped config.');
  const entry = buildServerEntry(cfg, target.startsWith('claude'));
  writeJson(file, mergeMcpConfig(readJsonSafe(file), cfg.serverName, entry));
  return file;
}
