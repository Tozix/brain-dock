import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RemotePrincipal } from './auth';
import type { RemoteServices } from './services';
import { registerRemoteTools } from './tools';

const principal: RemotePrincipal = {
  userId: 'u1',
  email: 'u@x.io',
  role: 'USER',
  keyId: 'k1',
  rateLimit: null,
};

interface Recorded {
  // biome-ignore lint/suspicious/noExplicitAny: capture raw call options.
  searchOpts?: any;
}

/** Minimal RemoteServices double; `searchImpl` lets a test inject failures. */
function fakeServices(recorded: Recorded, searchImpl?: () => Promise<unknown[]>): RemoteServices {
  return {
    prisma: {
      project: {
        findMany: async () => [{ id: 'p1', slug: 'demo', name: 'Demo' }],
      },
    },
    usage: { record: async () => {} },
    collection: 'code_test',
    search: {
      // biome-ignore lint/suspicious/noExplicitAny: minimal service double.
      search: async (_query: string, opts: any) => {
        recorded.searchOpts = opts;
        if (searchImpl) return searchImpl();
        return [
          {
            score: 0.9,
            role: 'service',
            symbol: 'AuthService',
            repo: 'api',
            path: 'a.ts',
            startLine: 1,
          },
        ];
      },
    },
  } as unknown as RemoteServices;
}

async function connect(
  services: RemoteServices,
  projectId: string | null,
): Promise<{ client: Client }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerRemoteTools(server, services, { principal, projectId });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client };
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  return content?.[0]?.text ?? '';
}

describe('registerRemoteTools', () => {
  it('exposes the hosted tool set via tools/list', async () => {
    const { client } = await connect(fakeServices({}), 'p1');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'list_projects',
        'search_code',
        'generate_context',
        'search_everywhere',
        'remember',
        'search_memory',
        'save_knowledge',
        'search_knowledge',
        'save_document',
        'search_docs',
        'find_symbol',
        'find_controller',
        'find_endpoint',
        'summarize_project',
        'get_architecture',
        'impact',
        'export_graph',
      ]),
    );
    await client.close();
  });

  it('list_projects lists the principal projects', async () => {
    const { client } = await connect(fakeServices({}), null);
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    expect(textOf(result)).toContain('demo');
    await client.close();
  });

  it('search_code scopes the query to the resolved project', async () => {
    const recorded: Recorded = {};
    const { client } = await connect(fakeServices(recorded), 'p1');
    const result = await client.callTool({ name: 'search_code', arguments: { query: 'auth' } });
    expect(textOf(result)).toContain('AuthService');
    expect(recorded.searchOpts.projectId).toBe('p1');
    expect(recorded.searchOpts.collection).toBe('code_test');
    await client.close();
  });

  it('asks for X-Project when no project is selected', async () => {
    const { client } = await connect(fakeServices({}), null);
    for (const call of [
      { name: 'search_code', arguments: { query: 'x' } },
      { name: 'find_symbol', arguments: { name: 'AuthService' } },
      { name: 'summarize_project', arguments: {} },
    ]) {
      const result = await client.callTool(call);
      expect(textOf(result)).toContain('No project selected');
      expect(textOf(result)).toContain('X-Project');
    }
    await client.close();
  });

  it('hides infrastructure errors behind a generic message with isError', async () => {
    const boom = () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:6333 qdrant exploded'));
    const { client } = await connect(fakeServices({}, boom), 'p1');
    const result = await client.callTool({ name: 'search_code', arguments: { query: 'x' } });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(result)).toBe('backend unavailable, try again later');
    expect(textOf(result)).not.toContain('ECONNREFUSED');
    await client.close();
  });

  it('a failing usage recorder does not break tool replies', async () => {
    const services = fakeServices({});
    // biome-ignore lint/suspicious/noExplicitAny: override the double.
    (services as any).usage = { record: () => Promise.reject(new Error('usage db down')) };
    const { client } = await connect(services, null);
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    expect(textOf(result)).toContain('demo');
    await client.close();
  });
});
