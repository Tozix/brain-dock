import { describe, expect, it } from 'bun:test';
import {
  type AgentTarget,
  buildServerEntry,
  configPathFor,
  type McpServerConfig,
  mergeMcpConfig,
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
