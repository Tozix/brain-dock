import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './server';

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  return content?.[0]?.text ?? '';
}

describe('brain-dock MCP server — structural tools (no Qdrant)', () => {
  let client: Client;

  beforeAll(async () => {
    // Bogus service URLs: structural tools only use the in-memory index of apps/api/src.
    const server = createMcpServer({
      projectRoot: 'apps/api/src',
      projectId: 'test',
      collection: 'code_test',
      qdrantUrl: 'http://localhost:1',
      ollamaUrl: 'http://localhost:1',
      embeddingModel: 'x',
      embedder: 'deterministic',
      databaseUrl: '',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('exposes the expected tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'reindex',
        'search_code',
        'generate_context',
        'find_symbol',
        'find_service',
        'find_controller',
        'find_module',
        'summarize_project',
        'get_architecture',
      ]),
    );
  });

  it('summarize_project reports counts and role breakdown', async () => {
    const result = await client.callTool({ name: 'summarize_project', arguments: {} });
    const body = textOf(result);
    expect(body).toContain('Files:');
    expect(body).toContain('service:');
    expect(body).toContain('controller:');
  });

  it('find_service finds AuthService', async () => {
    const result = await client.callTool({ name: 'find_service', arguments: {} });
    expect(textOf(result)).toContain('AuthService');
  });

  it('get_architecture lists controllers with routes and DI edges', async () => {
    const result = await client.callTool({ name: 'get_architecture', arguments: {} });
    const body = textOf(result);
    expect(body).toContain('AuthController');
    expect(body).toContain('AuthController → AuthService');
  });

  it('find_guard finds a guard and find_endpoint lists routes', async () => {
    const guards = textOf(await client.callTool({ name: 'find_guard', arguments: {} }));
    expect(guards.toLowerCase()).toContain('guard');

    const endpoints = textOf(await client.callTool({ name: 'find_endpoint', arguments: {} }));
    expect(endpoints).toMatch(/(GET|POST|PATCH|DELETE)\s+\S+\s+→/);
  });

  it('export_graph returns JSON and DOT', async () => {
    const json = textOf(await client.callTool({ name: 'export_graph', arguments: {} }));
    const parsed = JSON.parse(json) as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);

    const dot = textOf(
      await client.callTool({ name: 'export_graph', arguments: { format: 'dot' } }),
    );
    expect(dot.startsWith('digraph deps {')).toBe(true);
  });

  it('exposes prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(
      expect.arrayContaining(['onboard', 'explain_symbol']),
    );
  });

  it('exposes the architecture resource', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('brain-dock://architecture');
    const read = await client.readResource({ uri: 'brain-dock://architecture' });
    const content = (read.contents as Array<{ text?: string }>)[0];
    expect(content?.text).toContain('Modules');
  });
});

describe('brain-dock MCP server — multi-repo', () => {
  let client: Client;

  beforeAll(async () => {
    const server = createMcpServer({
      projectRoot: 'apps/api/src',
      projectId: 'test',
      collection: 'code_test',
      repos: [
        { alias: 'api', root: 'apps/api/src' },
        { alias: 'idx', root: 'packages/indexer/src' },
      ],
      qdrantUrl: 'http://localhost:1',
      ollamaUrl: 'http://localhost:1',
      embeddingModel: 'x',
      embedder: 'deterministic',
      databaseUrl: '',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('list_repos lists both configured repositories', async () => {
    const body = textOf(await client.callTool({ name: 'list_repos', arguments: {} }));
    expect(body).toContain('api');
    expect(body).toContain('idx');
  });

  it('find_symbol prefixes paths with the repo alias across repos', async () => {
    const auth = textOf(
      await client.callTool({ name: 'find_symbol', arguments: { name: 'AuthService' } }),
    );
    expect(auth).toContain('api/');

    const indexer = textOf(
      await client.callTool({ name: 'find_symbol', arguments: { name: 'RepositoryIndexer' } }),
    );
    expect(indexer).toContain('idx/');
  });

  it('summarize_project reports per-repo counts', async () => {
    const body = textOf(await client.callTool({ name: 'summarize_project', arguments: {} }));
    expect(body).toContain('Repositories (2)');
    expect(body).toContain('api:');
    expect(body).toContain('idx:');
  });
});
