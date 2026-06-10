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
  /** Project.profile served by the fake prisma. */
  profile?: string | null;
  /** Repository rows served by the fake prisma. */
  // biome-ignore lint/suspicious/noExplicitAny: minimal row doubles.
  repositories?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: capture raw update args.
  projectUpdate?: any;
  // biome-ignore lint/suspicious/noExplicitAny: capture raw update args.
  repoUpdate?: any;
  // biome-ignore lint/suspicious/noExplicitAny: capture enqueued jobs.
  enqueued?: any[];
  /** When true, the services double gets an IndexQueue recording into `enqueued`. */
  withQueue?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: capture repoMap args.
  repoMapArgs?: any[];
}

/** Minimal RemoteServices double; `searchImpl` lets a test inject failures. */
function fakeServices(recorded: Recorded, searchImpl?: () => Promise<unknown[]>): RemoteServices {
  recorded.enqueued = recorded.enqueued ?? [];
  return {
    prisma: {
      project: {
        findMany: async () => [{ id: 'p1', slug: 'demo', name: 'Demo' }],
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === 'p1' ? { id: 'p1', profile: recorded.profile ?? null } : null,
        // biome-ignore lint/suspicious/noExplicitAny: minimal service double.
        update: async (args: any) => {
          recorded.projectUpdate = args;
          return { id: 'p1', profile: args.data.profile };
        },
      },
      repository: {
        findMany: async () => recorded.repositories ?? [],
        // biome-ignore lint/suspicious/noExplicitAny: minimal service double.
        update: async (args: any) => {
          recorded.repoUpdate = args;
          return {};
        },
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
    context: { buildContext: async () => ({ text: 'CTX' }) },
    symbols: {
      // biome-ignore lint/suspicious/noExplicitAny: minimal service double.
      repoMap: async (...args: any[]) => {
        recorded.repoMapArgs = args;
        return 'MAP';
      },
    },
    queue: recorded.withQueue
      ? // biome-ignore lint/suspicious/noExplicitAny: minimal queue double.
        { enqueue: async (job: any) => void recorded.enqueued?.push(job) }
      : undefined,
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
        'get_project_profile',
        'update_project_profile',
        'index_status',
        'trigger_reindex',
        'repo_map',
      ]),
    );
    await client.close();
  });

  it('marks read-only tools with readOnlyHint and write tools without it', async () => {
    const { client } = await connect(fakeServices({}), 'p1');
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));

    for (const name of [
      'list_projects',
      'search_code',
      'generate_context',
      'search_everywhere',
      'search_memory',
      'search_knowledge',
      'search_docs',
      'find_symbol',
      'find_controller',
      'find_endpoint',
      'summarize_project',
      'get_architecture',
      'find_dependencies',
      'find_dependents',
      'impact',
      'export_graph',
      'get_project_profile',
      'index_status',
      'repo_map',
    ]) {
      expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true);
    }
    for (const name of [
      'remember',
      'save_knowledge',
      'save_document',
      'update_project_profile',
      'trigger_reindex',
    ]) {
      expect(byName.get(name)?.annotations?.readOnlyHint).not.toBe(true);
    }
    // Creating tools are explicitly NOT idempotent.
    expect(byName.get('remember')?.annotations?.idempotentHint).toBe(false);
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

describe('project profile tools', () => {
  it('get_project_profile returns the profile, or a hint when unset', async () => {
    const { client } = await connect(fakeServices({ profile: 'Use Bun, not Node.' }), 'p1');
    expect(textOf(await client.callTool({ name: 'get_project_profile', arguments: {} }))).toBe(
      'Use Bun, not Node.',
    );
    await client.close();

    const { client: empty } = await connect(fakeServices({}), 'p1');
    expect(textOf(await empty.callTool({ name: 'get_project_profile', arguments: {} }))).toContain(
      'update_project_profile',
    );
    await empty.close();
  });

  it('update_project_profile replaces the profile wholesale', async () => {
    const recorded: Recorded = {};
    const { client } = await connect(fakeServices(recorded), 'p1');
    const result = await client.callTool({
      name: 'update_project_profile',
      arguments: { profile: 'New profile' },
    });
    expect(textOf(result)).toContain('updated');
    expect(recorded.projectUpdate.where).toEqual({ id: 'p1' });
    expect(recorded.projectUpdate.data).toEqual({ profile: 'New profile' });
    await client.close();
  });

  it('update_project_profile clears on empty string and rejects >4096 chars', async () => {
    const recorded: Recorded = {};
    const { client } = await connect(fakeServices(recorded), 'p1');

    const cleared = await client.callTool({
      name: 'update_project_profile',
      arguments: { profile: '' },
    });
    expect(textOf(cleared)).toContain('cleared');
    expect(recorded.projectUpdate.data).toEqual({ profile: null });

    recorded.projectUpdate = undefined;
    const tooLong = await client.callTool({
      name: 'update_project_profile',
      arguments: { profile: 'x'.repeat(4097) },
    });
    expect(textOf(tooLong)).toContain('4096');
    expect(recorded.projectUpdate).toBeUndefined(); // nothing was written
    await client.close();
  });

  it('generate_context prepends the profile block when one is set', async () => {
    const { client } = await connect(fakeServices({ profile: 'Use Bun.' }), 'p1');
    const result = await client.callTool({
      name: 'generate_context',
      arguments: { query: 'auth' },
    });
    expect(textOf(result)).toBe('## Project profile\nUse Bun.\n\n---\nCTX');
    await client.close();

    const { client: bare } = await connect(fakeServices({}), 'p1');
    const plain = await bare.callTool({ name: 'generate_context', arguments: { query: 'auth' } });
    expect(textOf(plain)).toBe('CTX');
    await bare.close();
  });
});

describe('indexing tools', () => {
  const repoRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'r1',
    alias: 'api',
    root: '/srv/repos/api',
    indexStatus: 'READY',
    indexError: null,
    lastIndexedAt: new Date('2026-06-01T00:00:00Z'),
    indexedFileCount: 12,
    symbolCount: 99,
    ...overrides,
  });

  it('index_status lists repositories with status, counters and errors', async () => {
    const recorded: Recorded = {
      repositories: [
        repoRow(),
        repoRow({ id: 'r2', alias: 'web', indexStatus: 'FAILED', indexError: 'qdrant down' }),
        repoRow({
          id: 'r3',
          alias: 'fresh',
          indexStatus: null,
          lastIndexedAt: null,
          indexedFileCount: null,
          symbolCount: null,
        }),
      ],
    };
    const { client } = await connect(fakeServices(recorded), 'p1');
    const body = textOf(await client.callTool({ name: 'index_status', arguments: {} }));
    expect(body).toContain('api: READY');
    expect(body).toContain('12 files');
    expect(body).toContain('99 symbols');
    expect(body).toContain('web: FAILED');
    expect(body).toContain('error: qdrant down');
    expect(body).toContain('fresh: NEVER_INDEXED');
    await client.close();
  });

  it('index_status explains what to do when the project has no repositories', async () => {
    const { client } = await connect(fakeServices({ repositories: [] }), 'p1');
    const body = textOf(await client.callTool({ name: 'index_status', arguments: {} }));
    expect(body).toContain('No repositories');
    expect(body).toContain('repositories');
    await client.close();
  });

  it('trigger_reindex stamps QUEUED and enqueues a job for the only repository', async () => {
    const recorded: Recorded = { repositories: [repoRow()], withQueue: true };
    const { client } = await connect(fakeServices(recorded), 'p1');
    const body = textOf(await client.callTool({ name: 'trigger_reindex', arguments: {} }));
    expect(body).toContain('queued');
    expect(recorded.repoUpdate.where).toEqual({ id: 'r1' });
    expect(recorded.repoUpdate.data).toMatchObject({ indexStatus: 'QUEUED', indexError: null });
    expect(recorded.enqueued).toEqual([
      {
        projectId: 'p1',
        rootDir: '/srv/repos/api',
        collection: 'code_test',
        repo: 'api',
        repositoryId: 'r1',
      },
    ]);
    await client.close();
  });

  it('trigger_reindex refuses a duplicate while a job is queued or indexing', async () => {
    for (const indexStatus of ['QUEUED', 'INDEXING']) {
      const recorded: Recorded = { repositories: [repoRow({ indexStatus })], withQueue: true };
      const { client } = await connect(fakeServices(recorded), 'p1');
      const body = textOf(await client.callTool({ name: 'trigger_reindex', arguments: {} }));
      expect(body).toContain(`already ${indexStatus.toLowerCase()}`);
      expect(recorded.enqueued).toEqual([]);
      expect(recorded.repoUpdate).toBeUndefined();
      await client.close();
    }
  });

  it('trigger_reindex asks for a repo alias when the project has several', async () => {
    const recorded: Recorded = {
      repositories: [repoRow(), repoRow({ id: 'r2', alias: 'web' })],
      withQueue: true,
    };
    const { client } = await connect(fakeServices(recorded), 'p1');
    const ambiguous = textOf(await client.callTool({ name: 'trigger_reindex', arguments: {} }));
    expect(ambiguous).toContain('api, web');
    const unknown = textOf(
      await client.callTool({ name: 'trigger_reindex', arguments: { repo: 'ghost' } }),
    );
    expect(unknown).toContain('Unknown repo "ghost"');
    expect(recorded.enqueued).toEqual([]);
    await client.close();
  });

  it('trigger_reindex points at the upload path when no queue is wired', async () => {
    const recorded: Recorded = { repositories: [repoRow()] }; // withQueue not set
    const { client } = await connect(fakeServices(recorded), 'p1');
    const body = textOf(await client.callTool({ name: 'trigger_reindex', arguments: {} }));
    expect(body).toContain('not enabled');
    expect(body).toContain('index');
    expect(recorded.repoUpdate).toBeUndefined();
    await client.close();
  });
});

describe('repo_map tool', () => {
  it('delegates to SymbolIndexService.repoMap with project scope and params', async () => {
    const recorded: Recorded = {};
    const { client } = await connect(fakeServices(recorded), 'p1');
    const result = await client.callTool({
      name: 'repo_map',
      arguments: { query: 'auth', repos: ['api'], max_tokens: 500 },
    });
    expect(textOf(result)).toBe('MAP');
    expect(recorded.repoMapArgs).toEqual(['p1', ['api'], 'auth', 500]);
    await client.close();
  });

  it('asks for a project when none is selected', async () => {
    const { client } = await connect(fakeServices({}), null);
    const result = await client.callTool({ name: 'repo_map', arguments: {} });
    expect(textOf(result)).toContain('No project selected');
    await client.close();
  });
});
