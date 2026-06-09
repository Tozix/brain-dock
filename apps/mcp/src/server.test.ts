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
});
