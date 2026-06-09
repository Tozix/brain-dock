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

/** Read + parse a JSON config, tolerating absence/garbage by returning an empty object. */
export function readJsonSafe(file: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
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
