import { IndexStatus } from '@brain-dock/db';
import { DOC_FORMATS, KNOWLEDGE_TYPES, MEMORY_TYPES } from '@brain-dock/knowledge';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { listUserProjects, type RemotePrincipal } from './auth';
import type { RemoteServices } from './services';

/** Server-level usage protocol, surfaced to clients via the MCP `initialize` response. */
export const REMOTE_SERVER_INSTRUCTIONS = `brain-dock — hosted code-knowledge MCP server. It serves code search, structural/graph queries and persistent project memory from a server-side index; nothing runs on your machine.

Protocol:
- If no project is selected, call list_projects first, then select one with the X-Project header (project slug or id) or by connecting to /mcp/{slug} instead of /mcp.
- Structural tools (find_*, find_endpoint, get_architecture, summarize_project, find_dependencies, find_dependents, impact, export_graph, repo_map) read the server-side index — the repository must be indexed first. If they come back empty, call index_status to see whether indexing is queued, running or failed.
- repo_map returns a ranked one-call overview of the codebase — a good first step in an unfamiliar project. Use find_symbol to locate a symbol, then pass its exact name to impact / find_dependencies / find_dependents.
- search_everywhere answers broad questions across code + memory + knowledge + documents; search_code is for code-only queries; generate_context builds an LLM-ready context block (it always starts with the pinned project profile, when one is set).
- Persist durable facts with remember (short facts/decisions) or save_knowledge (titled entries); maintain the pinned project profile with get_project_profile / update_project_profile.`;

const NEED_PROJECT =
  'No project selected. Call `list_projects`, then set the `X-Project` header (project id or slug) — or connect to /mcp/{slug} instead of /mcp.';

const BACKEND_UNAVAILABLE = 'backend unavailable, try again later';

/** Maximum length of the pinned project profile (mirrors the REST validation). */
const MAX_PROFILE_CHARS = 4096;

// Annotation presets (hints only — see MCP spec). Read-only tools are marked so clients
// (Claude Code, VS Code) can auto-approve them without a permission prompt.
const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
/** Creates a new record per call: not read-only, not destructive, NOT idempotent. */
const CREATES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};

/**
 * Wrap a tool handler: log the full error server-side, hand the client a generic message instead
 * of a raw stack/driver error. Expected domain outcomes (NEED_PROJECT, "No results.", …) are
 * returned by the handlers as text, so anything *thrown* here is infrastructure (Postgres/Qdrant/
 * Ollama down) and must not leak internals.
 */
const guard =
  <A>(tool: string, handler: (args: A) => Promise<CallToolResult>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      console.error(`[mcp:tools] ${tool} failed:`, error);
      return { content: [{ type: 'text' as const, text: BACKEND_UNAVAILABLE }], isError: true };
    }
  };

export interface RemoteToolContext {
  principal: RemotePrincipal;
  /** Resolved from the /mcp/{slug} URL segment or the X-Project header; null when not provided. */
  projectId: string | null;
}

/**
 * Register the persisted (Qdrant + Postgres) tools for the hosted MCP, scoped to the request's
 * project. Structural/graph tools are served from the Postgres symbol index (no user files needed).
 */
export function registerRemoteTools(
  server: McpServer,
  services: RemoteServices,
  ctx: RemoteToolContext,
): void {
  const { collection } = services;
  const project = ctx.projectId;

  // Every tool returns through `text(...)` exactly once — so this is our per-call usage hook.
  const text = (body: string) => {
    void services.usage
      .record(ctx.principal.userId, Math.ceil(body.length / 4))
      .catch((e) => console.error('[mcp:usage] record failed:', e?.message ?? e));
    return { content: [{ type: 'text' as const, text: body }] };
  };

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description:
        'List the projects available to your API key. Call this first when no project is ' +
        'selected, then pass a slug/id via the X-Project header or connect to /mcp/{slug}.',
      annotations: READ_ONLY,
    },
    guard('list_projects', async () => {
      const projects = await listUserProjects(services.prisma, ctx.principal.userId);
      if (projects.length === 0) return text('No projects yet.');
      return text(projects.map((p) => `${p.slug}  (${p.name})  id=${p.id}`).join('\n'));
    }),
  );

  server.registerTool(
    'search_code',
    {
      title: 'Search code',
      description:
        'Hybrid (vector + keyword) search over the indexed code. Best for code-only queries; ' +
        'use search_everywhere for questions that may also touch memory/knowledge/documents. ' +
        'Requires the repository to be indexed — if results are empty, check index_status.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional(),
        repos: z.array(z.string()).optional().describe('Restrict to repository aliases'),
      },
      annotations: READ_ONLY,
    },
    guard('search_code', async ({ query, limit, repos }) => {
      if (!project) return text(NEED_PROJECT);
      const results = await services.search.search(query, {
        projectId: project,
        collection,
        repos,
        limit: limit ?? 10,
      });
      if (results.length === 0) return text('No results.');
      return text(
        results
          .map(
            (r) =>
              `${r.score.toFixed(3)}  ${r.role} ${r.symbol}  (${r.repo}/${r.path}:${r.startLine})`,
          )
          .join('\n'),
      );
    }),
  );

  server.registerTool(
    'generate_context',
    {
      title: 'Generate context',
      description:
        'Build a budget-bounded, intent-aware context block for a query — ready to feed to an ' +
        'LLM. The pinned project profile (see update_project_profile) is prepended when set. ' +
        'Requires indexed code.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(20).optional(),
        maxChars: z.number().int().positive().max(20000).optional(),
        repos: z.array(z.string()).optional(),
      },
      annotations: READ_ONLY,
    },
    guard('generate_context', async ({ query, limit, maxChars, repos }) => {
      if (!project) return text(NEED_PROJECT);
      const [result, row] = await Promise.all([
        services.context.buildContext(query, {
          projectId: project,
          collection,
          repos,
          limit: limit ?? 8,
          maxChars: maxChars ?? 6000,
        }),
        services.prisma.project.findUnique({
          where: { id: project },
          select: { profile: true },
        }),
      ]);
      const prefix = row?.profile ? `## Project profile\n${row.profile}\n\n---\n` : '';
      return text(prefix + result.text);
    }),
  );

  server.registerTool(
    'search_everywhere',
    {
      title: 'Search everywhere',
      description:
        'One query across code + memory + knowledge + documents, ranked together. Use this for ' +
        'broad questions ("how do we handle auth?"); use search_code for code-only lookups.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional(),
        repos: z.array(z.string()).optional(),
      },
      annotations: READ_ONLY,
    },
    guard('search_everywhere', async ({ query, limit, repos }) => {
      if (!project) return text(NEED_PROJECT);
      const results = await services.unified.search(query, {
        projectId: project,
        codeCollection: collection,
        repos,
        limit: limit ?? 10,
      });
      if (results.length === 0) return text('No results across any source.');
      return text(
        results.map((r) => `${r.score.toFixed(3)}  [${r.source}] ${r.title} — ${r.ref}`).join('\n'),
      );
    }),
  );

  // --- Project profile (pinned "core memory" block) ---

  server.registerTool(
    'get_project_profile',
    {
      title: 'Get project profile',
      description:
        'Read the pinned project profile — a small block of durable conventions/facts that ' +
        'generate_context prepends to every answer. Returns a hint when none is set.',
      annotations: READ_ONLY,
    },
    guard('get_project_profile', async () => {
      if (!project) return text(NEED_PROJECT);
      const row = await services.prisma.project.findUnique({
        where: { id: project },
        select: { profile: true },
      });
      if (!row?.profile) {
        return text('No project profile set. Use update_project_profile to create one.');
      }
      return text(row.profile);
    }),
  );

  server.registerTool(
    'update_project_profile',
    {
      title: 'Update project profile',
      description:
        `Replace the pinned project profile wholesale (max ${MAX_PROFILE_CHARS} chars; an empty ` +
        'string clears it). Keep it a compact summary: stack, conventions, key decisions. ' +
        'For individual facts prefer remember/save_knowledge.',
      inputSchema: {
        profile: z.string().describe('Full replacement text. An empty string clears the profile.'),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    guard('update_project_profile', async ({ profile }) => {
      if (!project) return text(NEED_PROJECT);
      if (profile.length > MAX_PROFILE_CHARS) {
        return text(
          `Profile too long: ${profile.length} chars (max ${MAX_PROFILE_CHARS}). ` +
            'Keep it a compact summary; move details into save_knowledge entries.',
        );
      }
      const value = profile.trim() === '' ? null : profile;
      await services.prisma.project.update({ where: { id: project }, data: { profile: value } });
      return text(
        value === null
          ? 'Project profile cleared.'
          : `Project profile updated (${value.length} chars).`,
      );
    }),
  );

  // --- Indexing lifecycle ---

  server.registerTool(
    'index_status',
    {
      title: 'Indexing status',
      description:
        'Show the indexing lifecycle of every repository in the project (QUEUED/INDEXING/READY/' +
        'FAILED, last error, counters). Call this when structural tools or search return nothing.',
      annotations: READ_ONLY,
    },
    guard('index_status', async () => {
      if (!project) return text(NEED_PROJECT);
      const repos = await services.prisma.repository.findMany({
        where: { projectId: project },
        orderBy: { createdAt: 'asc' },
      });
      if (repos.length === 0) {
        return text(
          'No repositories in this project. Create one (POST /api/v1/projects/{id}/repositories ' +
            'or the VS Code extension), then index it — structural tools need an indexed repo.',
        );
      }
      return text(
        repos
          .map((r) => {
            const parts = [`${r.alias}: ${r.indexStatus ?? 'NEVER_INDEXED'}`];
            if (r.lastIndexedAt) parts.push(`last indexed ${r.lastIndexedAt.toISOString()}`);
            if (r.indexedFileCount != null) parts.push(`${r.indexedFileCount} files`);
            if (r.symbolCount != null) parts.push(`${r.symbolCount} symbols`);
            if (r.indexStatus === IndexStatus.FAILED && r.indexError) {
              parts.push(`error: ${r.indexError}`);
            }
            return parts.join('  ·  ');
          })
          .join('\n'),
      );
    }),
  );

  server.registerTool(
    'trigger_reindex',
    {
      title: 'Trigger reindex',
      description:
        'Queue a server-side reindex of one repository (skipped when one is already queued or ' +
        'running). Track progress with index_status. On deployments without server-side ' +
        'indexing, use the upload path instead (VS Code extension or POST …/index).',
      inputSchema: {
        repo: z.string().optional().describe('Repository alias (default: the only repository)'),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    guard('trigger_reindex', async ({ repo }) => {
      if (!project) return text(NEED_PROJECT);
      const repos = await services.prisma.repository.findMany({ where: { projectId: project } });
      if (repos.length === 0) return text('No repositories in this project — nothing to reindex.');
      const aliases = repos.map((r) => r.alias).join(', ');
      const target = repo
        ? repos.find((r) => r.alias === repo)
        : repos.length === 1
          ? repos[0]
          : undefined;
      if (!target) {
        return text(
          repo
            ? `Unknown repo "${repo}". Known: ${aliases}`
            : `Multiple repositories — pass \`repo\`. Known: ${aliases}`,
        );
      }
      if (
        target.indexStatus === IndexStatus.QUEUED ||
        target.indexStatus === IndexStatus.INDEXING
      ) {
        return text(
          `Reindex already ${target.indexStatus.toLowerCase()} for "${target.alias}" — ` +
            'check index_status.',
        );
      }
      if (!services.queue) {
        return text(
          'Server-side reindexing is not enabled on this deployment. Index by uploading files: ' +
            'POST /api/v1/projects/{projectId}/repositories/{id}/index (the VS Code extension ' +
            'does this for you).',
        );
      }
      await services.prisma.repository.update({
        where: { id: target.id },
        data: { indexStatus: IndexStatus.QUEUED, indexError: null },
      });
      await services.queue.enqueue({
        projectId: project,
        rootDir: target.root,
        collection,
        repo: target.alias,
        repositoryId: target.id,
      });
      return text(`Reindex queued for "${target.alias}" — track it with index_status.`);
    }),
  );

  // --- Memory / knowledge / documents ---

  server.registerTool(
    'remember',
    {
      title: 'Remember',
      description:
        'Save a long-term project memory (decision/fact/note/todo). Each call creates a new ' +
        'item — recall later with search_memory. For longer, titled material use save_knowledge.',
      inputSchema: {
        content: z.string(),
        type: z.enum(MEMORY_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
      annotations: CREATES,
    },
    guard('remember', async ({ content, type, tags }) => {
      if (!project) return text(NEED_PROJECT);
      const item = await services.memory.remember({ projectId: project, content, type, tags });
      return text(`Remembered [${item.type}] ${item.id}`);
    }),
  );

  server.registerTool(
    'search_memory',
    {
      title: 'Search memory',
      description:
        'Semantic search over memories saved with remember (decisions, facts, notes, todos).',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
      annotations: READ_ONLY,
    },
    guard('search_memory', async ({ query, limit }) => {
      if (!project) return text(NEED_PROJECT);
      const hits = await services.memory.search(project, query, limit ?? 10);
      if (hits.length === 0) return text('No matching memories.');
      return text(
        hits.map((h) => `${h.score.toFixed(3)}  [${h.item.type}] ${h.item.content}`).join('\n'),
      );
    }),
  );

  server.registerTool(
    'save_knowledge',
    {
      title: 'Save knowledge',
      description:
        'Save a titled knowledge-base entry (business rule/architecture/ADR/FAQ/…). Each call ' +
        'creates a new entry — find them later with search_knowledge or search_everywhere.',
      inputSchema: {
        title: z.string(),
        content: z.string(),
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
      annotations: CREATES,
    },
    guard('save_knowledge', async ({ title, content, type, tags }) => {
      if (!project) return text(NEED_PROJECT);
      const item = await services.knowledge.save({
        projectId: project,
        title,
        content,
        type,
        tags,
      });
      return text(`Saved knowledge [${item.type}] "${item.title}" ${item.id}`);
    }),
  );

  server.registerTool(
    'search_knowledge',
    {
      title: 'Search knowledge',
      description: 'Semantic search over the knowledge base (entries saved with save_knowledge).',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
      annotations: READ_ONLY,
    },
    guard('search_knowledge', async ({ query, limit }) => {
      if (!project) return text(NEED_PROJECT);
      const hits = await services.knowledge.search(project, query, limit ?? 10);
      if (hits.length === 0) return text('No matching knowledge.');
      return text(
        hits.map((h) => `${h.score.toFixed(3)}  [${h.item.type}] ${h.item.title}`).join('\n'),
      );
    }),
  );

  server.registerTool(
    'save_document',
    {
      title: 'Save document',
      description:
        'Ingest a document (md/txt/mdx/json/yaml as text; PDF/DOCX as base64): it is stored, ' +
        'chunked and embedded for search_docs/search_everywhere. Each call creates a new document.',
      inputSchema: {
        title: z.string(),
        content: z.string(),
        format: z.enum(DOC_FORMATS).optional(),
        source: z.string().optional(),
      },
      annotations: CREATES,
    },
    guard('save_document', async ({ title, content, format, source }) => {
      if (!project) return text(NEED_PROJECT);
      const { document, chunks } = await services.documents.ingest({
        projectId: project,
        title,
        content,
        format: format ?? 'MD',
        source,
      });
      return text(`Saved document "${document.title}" (${chunks} chunks) ${document.id}`);
    }),
  );

  server.registerTool(
    'search_docs',
    {
      title: 'Search documents',
      description: 'Semantic search over documents ingested with save_document.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
      annotations: READ_ONLY,
    },
    guard('search_docs', async ({ query, limit }) => {
      if (!project) return text(NEED_PROJECT);
      const hits = await services.documents.search(project, query, limit ?? 10);
      if (hits.length === 0) return text('No matching documents.');
      return text(
        hits
          .map((h) => `${h.score.toFixed(3)}  [${h.document.format}] ${h.document.title}`)
          .join('\n'),
      );
    }),
  );

  // --- Structural / graph tools (served from the Postgres symbol index; no user files needed) ---

  const repos = (r?: string[]) => r;

  server.registerTool(
    'repo_map',
    {
      title: 'Repo map',
      description:
        'Token-budgeted map of the indexed codebase: symbols ranked by dependency centrality ' +
        '(PageRank), optionally biased toward a query. The best single call to orient yourself ' +
        'in an unfamiliar project. Requires an indexed repository — see index_status when empty.',
      inputSchema: {
        query: z.string().optional().describe('Bias the ranking toward matching symbols/files'),
        repos: z.array(z.string()).optional(),
        max_tokens: z.number().int().positive().max(8000).optional(),
      },
      annotations: READ_ONLY,
    },
    guard('repo_map', async ({ query, repos: rs, max_tokens }) => {
      if (!project) return text(NEED_PROJECT);
      return text(await services.symbols.repoMap(project, repos(rs), query, max_tokens));
    }),
  );

  server.registerTool(
    'find_symbol',
    {
      title: 'Find symbol',
      description:
        'Find indexed symbols by (sub)name. Use it to locate a symbol, then pass the exact name ' +
        'to impact / find_dependencies / find_dependents. Requires an indexed repository.',
      inputSchema: { name: z.string(), repos: z.array(z.string()).optional() },
      annotations: READ_ONLY,
    },
    guard('find_symbol', async ({ name, repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const rows = await services.symbols.findSymbols(project, { name, repos: repos(rs) });
      if (rows.length === 0) return text(`No symbol matching "${name}".`);
      return text(
        rows
          .map((s) => {
            const role = s.role !== 'none' ? `${s.role} ` : '';
            return `${s.repo}/${s.file}:${s.startLine}  ${role}${s.kind} ${s.name}`;
          })
          .join('\n'),
      );
    }),
  );

  const roleTool = (tool: string, role: string, label: string) => {
    server.registerTool(
      tool,
      {
        title: label,
        description:
          `List ${label.toLowerCase()} in the indexed code, optionally filtered by name. ` +
          'Requires an indexed repository (see index_status when empty).',
        inputSchema: { name: z.string().optional(), repos: z.array(z.string()).optional() },
        annotations: READ_ONLY,
      },
      guard(tool, async ({ name, repos: rs }) => {
        if (!project) return text(NEED_PROJECT);
        const rows = await services.symbols.findSymbols(project, { role, name, repos: repos(rs) });
        if (rows.length === 0) return text(`No ${role} found.`);
        return text(rows.map((s) => `${s.repo}/${s.file}:${s.startLine}  ${s.name}`).join('\n'));
      }),
    );
  };
  roleTool('find_controller', 'controller', 'Controllers');
  roleTool('find_service', 'service', 'Services');
  roleTool('find_module', 'module', 'Modules');
  roleTool('find_guard', 'guard', 'Guards');
  roleTool('find_repository', 'repository', 'Repositories');

  server.registerTool(
    'find_endpoint',
    {
      title: 'Find endpoints',
      description:
        'List HTTP endpoints (controller routes), optionally filtered by path substring. ' +
        'Requires an indexed repository.',
      inputSchema: { path: z.string().optional(), repos: z.array(z.string()).optional() },
      annotations: READ_ONLY,
    },
    guard('find_endpoint', async ({ path, repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const rows = await services.symbols.endpoints(project, { path, repos: repos(rs) });
      if (rows.length === 0) return text('No endpoints.');
      return text(
        rows
          .map(
            (e) =>
              `${e.method.toUpperCase()} ${e.path} → ${e.controller}.${e.handler}  (${e.repo}/${e.file})`,
          )
          .join('\n'),
      );
    }),
  );

  server.registerTool(
    'summarize_project',
    {
      title: 'Summarize project',
      description:
        'High-level stats of the indexed code: file/symbol/edge counts and a role breakdown. ' +
        'A quick health check — for an actual code overview prefer repo_map.',
      inputSchema: { repos: z.array(z.string()).optional() },
      annotations: READ_ONLY,
    },
    guard('summarize_project', async ({ repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const s = await services.symbols.summary(project, repos(rs));
      const roleLines = Object.entries(s.roles)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `  ${role}: ${count}`);
      return text(
        [
          `Repositories (${s.repos.length}): ${s.repos.join(', ') || '(none — index first, see index_status)'}`,
          `Files: ${s.files}`,
          `Symbols: ${s.symbols}`,
          `Edges: ${s.edges}`,
          'Roles:',
          ...roleLines,
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'get_architecture',
    {
      title: 'Get architecture',
      description:
        'NestJS-style architecture view: modules, controllers with their routes, and ' +
        'dependency-injection edges. Requires an indexed repository.',
      inputSchema: { repos: z.array(z.string()).optional() },
      annotations: READ_ONLY,
    },
    guard('get_architecture', async ({ repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const scope = repos(rs);
      const [modules, endpoints, graph] = await Promise.all([
        services.symbols.findSymbols(project, { role: 'module', repos: scope }),
        services.symbols.endpoints(project, { repos: scope }),
        services.symbols.graph(project, scope),
      ]);
      const edges = graph.edges
        .filter((e) => e.kind === 'injects')
        .map((e) => `${e.from} → ${e.to}`);
      return text(
        [
          `Modules (${modules.length}): ${modules.map((m) => m.name).join(', ')}`,
          '',
          'Endpoints:',
          ...endpoints.map(
            (e) => `  ${e.method.toUpperCase()} ${e.path} → ${e.controller}.${e.handler}`,
          ),
          '',
          `DI edges (${edges.length}):`,
          ...edges.slice(0, 40).map((e) => `  ${e}`),
        ].join('\n'),
      );
    }),
  );

  const graphTool = (
    tool: string,
    label: string,
    description: string,
    query: (g: Awaited<ReturnType<RemoteServices['symbols']['graph']>>, n: string) => string[],
  ) => {
    server.registerTool(
      tool,
      {
        title: label,
        description,
        inputSchema: { name: z.string(), repos: z.array(z.string()).optional() },
        annotations: READ_ONLY,
      },
      guard(tool, async ({ name, repos: rs }) => {
        if (!project) return text(NEED_PROJECT);
        const graph = await services.symbols.graph(project, repos(rs));
        if (!graph.has(name)) return text(`Symbol not found: ${name}`);
        const names = query(graph, name);
        if (names.length === 0) return text('(none)');
        return text(
          names
            .map((n) => {
              const node = graph.node(n);
              if (node?.internal) {
                const role = node.role && node.role !== 'none' ? `${node.role} ` : '';
                return `${role}${n}  (${node.repo}/${node.file})`;
              }
              return `${n}  (external)`;
            })
            .join('\n'),
        );
      }),
    );
  };
  graphTool(
    'find_dependencies',
    'Find dependencies',
    'What a symbol depends on (direct). Pass the exact name from find_symbol. ' +
      'Requires an indexed repository.',
    (g, n) => g.dependencies(n),
  );
  graphTool(
    'find_dependents',
    'Find dependents',
    'What depends on a symbol (direct). Pass the exact name from find_symbol. ' +
      'Requires an indexed repository.',
    (g, n) => g.dependents(n),
  );
  graphTool(
    'impact',
    'Impact (blast radius)',
    'Transitive dependents of a symbol — everything that may break if it changes. Use ' +
      'find_symbol first, then pass its exact name here. Requires an indexed repository.',
    (g, n) => g.impact(n),
  );

  server.registerTool(
    'export_graph',
    {
      title: 'Export dependency graph',
      description:
        'Export the full dependency graph as JSON (nodes+edges) or Graphviz DOT for ' +
        'visualization. Requires an indexed repository.',
      inputSchema: {
        format: z.enum(['json', 'dot']).optional(),
        repos: z.array(z.string()).optional(),
      },
      annotations: READ_ONLY,
    },
    guard('export_graph', async ({ format, repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const graph = await services.symbols.graph(project, repos(rs));
      return text(format === 'dot' ? graph.toDot() : JSON.stringify(graph.toJSON(), null, 2));
    }),
  );
}
