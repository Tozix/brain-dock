import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type AgentTarget,
  applyTarget,
  buildServerEntry,
  configPathFor,
  type McpServerConfig,
  mergeMcpConfig,
  readJsonSafe,
} from './agents';

const cfg: McpServerConfig = {
  serverName: 'brain-dock',
  mcpUrl: 'https://mcp.example.com/mcp',
  apiKey: 'bd_secret',
  project: 'my-app',
};

describe('buildServerEntry', () => {
  it('includes type:http for Claude Code', () => {
    const e = buildServerEntry(cfg, true);
    expect(e.type).toBe('http');
    expect(e.url).toBe('https://mcp.example.com/mcp');
    expect(e.headers.Authorization).toBe('Bearer bd_secret');
    expect(e.headers['X-Project']).toBe('my-app');
  });

  it('omits type for Cursor', () => {
    expect(buildServerEntry(cfg, false).type).toBeUndefined();
  });
});

describe('mergeMcpConfig', () => {
  it('adds the server while preserving existing keys', () => {
    const existing = { theme: 'dark', mcpServers: { other: { url: 'x' } } };
    const merged = mergeMcpConfig(existing, 'brain-dock', buildServerEntry(cfg, true));
    const servers = merged.mcpServers as Record<string, unknown>;
    expect(merged.theme).toBe('dark');
    expect(servers.other).toEqual({ url: 'x' });
    expect((servers['brain-dock'] as { url: string }).url).toBe('https://mcp.example.com/mcp');
  });

  it('creates mcpServers when absent', () => {
    const merged = mergeMcpConfig({}, 'brain-dock', buildServerEntry(cfg, false));
    expect(Object.keys(merged.mcpServers as object)).toEqual(['brain-dock']);
  });
});

describe('configPathFor', () => {
  const cases: Array<[AgentTarget, string]> = [
    ['claude-project', '/ws/.mcp.json'],
    ['claude-global', '/home/u/.claude.json'],
    ['cursor-project', '/ws/.cursor/mcp.json'],
    ['cursor-global', '/home/u/.cursor/mcp.json'],
  ];
  for (const [target, expected] of cases) {
    it(`resolves ${target}`, () => {
      expect(configPathFor(target, '/ws', '/home/u')).toBe(expected);
    });
  }

  it('returns undefined for project targets without a workspace', () => {
    expect(configPathFor('claude-project', undefined, '/home/u')).toBeUndefined();
    expect(configPathFor('cursor-project', undefined, '/home/u')).toBeUndefined();
  });
});

describe('readJsonSafe / applyTarget (disk I/O)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-agents-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns {} for a missing or empty file', () => {
    expect(readJsonSafe(path.join(dir, 'missing.json'))).toEqual({});
    const empty = path.join(dir, 'empty.json');
    fs.writeFileSync(empty, '  \n');
    expect(readJsonSafe(empty)).toEqual({});
  });

  it('throws instead of discarding an existing config it cannot parse', () => {
    const broken = path.join(dir, 'claude.json');
    fs.writeFileSync(broken, '{ totally broken');
    expect(() => readJsonSafe(broken)).toThrow(/not valid JSON/);
    expect(fs.readFileSync(broken, 'utf8')).toBe('{ totally broken'); // untouched
  });

  it('throws on a non-object JSON document', () => {
    const arr = path.join(dir, 'arr.json');
    fs.writeFileSync(arr, '[1, 2]');
    expect(() => readJsonSafe(arr)).toThrow(/JSON object/);
  });

  it('applyTarget merges into an existing config and leaves no tmp files behind', () => {
    const file = path.join(dir, '.mcp.json');
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { other: { url: 'x' } }, theme: 'dark' }));
    const written = applyTarget('claude-project', cfg, dir);
    expect(written).toBe(file);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      theme: string;
      mcpServers: Record<string, { url: string }>;
    };
    expect(parsed.theme).toBe('dark');
    expect(parsed.mcpServers.other?.url).toBe('x');
    expect(parsed.mcpServers['brain-dock']?.url).toBe(cfg.mcpUrl);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('applyTarget refuses to overwrite a corrupt existing config', () => {
    const file = path.join(dir, '.mcp.json');
    fs.writeFileSync(file, 'not json at all');
    expect(() => applyTarget('claude-project', cfg, dir)).toThrow(/not valid JSON/);
    expect(fs.readFileSync(file, 'utf8')).toBe('not json at all');
  });

  it('creates new files with owner-only permissions (API key inside)', () => {
    const file = path.join(dir, '.mcp.json');
    applyTarget('claude-project', cfg, dir);
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('preserves the permissions of an existing file', () => {
    if (process.platform === 'win32') return;
    const file = path.join(dir, '.mcp.json');
    fs.writeFileSync(file, '{}', { mode: 0o644 });
    fs.chmodSync(file, 0o644);
    applyTarget('claude-project', cfg, dir);
    expect(fs.statSync(file).mode & 0o777).toBe(0o644);
  });
});
