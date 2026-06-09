import { DOC_FORMATS, KNOWLEDGE_TYPES, MEMORY_TYPES } from '@brain-dock/knowledge';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listUserProjects, type RemotePrincipal } from './auth';
import type { RemoteServices } from './services';

const NEED_PROJECT =
  'No project selected. Set the `X-Project` header (project id or slug) — call `list_projects` to see yours.';

export interface RemoteToolContext {
  principal: RemotePrincipal;
  /** Resolved from the X-Project header; null when not provided. */
  projectId: string | null;
}

/**
 * Register the persisted (Qdrant + Postgres) tools for the hosted MCP, scoped to the request's
 * project. Structural/graph tools are intentionally excluded (they need a server-side symbol index).
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
    void services.usage?.record(ctx.principal.userId, Math.ceil(body.length / 4)).catch(() => {});
    return { content: [{ type: 'text' as const, text: body }] };
  };

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description:
        'List the projects available to your API key. Use a slug/id as the X-Project header.',
    },
    async () => {
      const projects = await listUserProjects(services.prisma, ctx.principal.userId);
      if (projects.length === 0) return text('No projects yet.');
      return text(projects.map((p) => `${p.slug}  (${p.name})  id=${p.id}`).join('\n'));
    },
  );

  server.registerTool(
    'search_code',
    {
      title: 'Search code',
      description: 'Hybrid (vector + keyword) search over your indexed code.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional(),
        repos: z.array(z.string()).optional().describe('Restrict to repository aliases'),
      },
    },
    async ({ query, limit, repos }) => {
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
    },
  );

  server.registerTool(
    'generate_context',
    {
      title: 'Generate context',
      description: 'Build a budget-bounded, intent-aware context block for a query.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(20).optional(),
        maxChars: z.number().int().positive().max(20000).optional(),
        repos: z.array(z.string()).optional(),
      },
    },
    async ({ query, limit, maxChars, repos }) => {
      if (!project) return text(NEED_PROJECT);
      const result = await services.context.buildContext(query, {
        projectId: project,
        collection,
        repos,
        limit: limit ?? 8,
        maxChars: maxChars ?? 6000,
      });
      return text(result.text);
    },
  );

  server.registerTool(
    'search_everywhere',
    {
      title: 'Search everywhere',
      description: 'One query across code + memory + knowledge + documents, ranked together.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional(),
        repos: z.array(z.string()).optional(),
      },
    },
    async ({ query, limit, repos }) => {
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
    },
  );

  server.registerTool(
    'remember',
    {
      title: 'Remember',
      description: 'Save a long-term project memory (decision/fact/note/todo).',
      inputSchema: {
        content: z.string(),
        type: z.enum(MEMORY_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ content, type, tags }) => {
      if (!project) return text(NEED_PROJECT);
      const item = await services.memory.remember({ projectId: project, content, type, tags });
      return text(`Remembered [${item.type}] ${item.id}`);
    },
  );

  server.registerTool(
    'search_memory',
    {
      title: 'Search memory',
      description: 'Semantic search over saved project memory.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
    },
    async ({ query, limit }) => {
      if (!project) return text(NEED_PROJECT);
      const hits = await services.memory.search(project, query, limit ?? 10);
      if (hits.length === 0) return text('No matching memories.');
      return text(
        hits.map((h) => `${h.score.toFixed(3)}  [${h.item.type}] ${h.item.content}`).join('\n'),
      );
    },
  );

  server.registerTool(
    'save_knowledge',
    {
      title: 'Save knowledge',
      description: 'Save a knowledge-base entry (business rule/architecture/ADR/FAQ/…).',
      inputSchema: {
        title: z.string(),
        content: z.string(),
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ title, content, type, tags }) => {
      if (!project) return text(NEED_PROJECT);
      const item = await services.knowledge.save({
        projectId: project,
        title,
        content,
        type,
        tags,
      });
      return text(`Saved knowledge [${item.type}] "${item.title}" ${item.id}`);
    },
  );

  server.registerTool(
    'search_knowledge',
    {
      title: 'Search knowledge',
      description: 'Semantic search over the knowledge base.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
    },
    async ({ query, limit }) => {
      if (!project) return text(NEED_PROJECT);
      const hits = await services.knowledge.search(project, query, limit ?? 10);
      if (hits.length === 0) return text('No matching knowledge.');
      return text(
        hits.map((h) => `${h.score.toFixed(3)}  [${h.item.type}] ${h.item.title}`).join('\n'),
      );
    },
  );

  server.registerTool(
    'save_document',
    {
      title: 'Save document',
      description:
        'Ingest a text document (md/txt/mdx/json/yaml + PDF/DOCX base64): chunked + embedded.',
      inputSchema: {
        title: z.string(),
        content: z.string(),
        format: z.enum(DOC_FORMATS).optional(),
        source: z.string().optional(),
      },
    },
    async ({ title, content, format, source }) => {
      if (!project) return text(NEED_PROJECT);
      const { document, chunks } = await services.documents.ingest({
        projectId: project,
        title,
        content,
        format: format ?? 'MD',
        source,
      });
      return text(`Saved document "${document.title}" (${chunks} chunks) ${document.id}`);
    },
  );

  server.registerTool(
    'search_docs',
    {
      title: 'Search documents',
      description: 'Semantic search over ingested documents.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
    },
    async ({ query, limit }) => {
      if (!project) return text(NEED_PROJECT);
      const hits = await services.documents.search(project, query, limit ?? 10);
      if (hits.length === 0) return text('No matching documents.');
      return text(
        hits
          .map((h) => `${h.score.toFixed(3)}  [${h.document.format}] ${h.document.title}`)
          .join('\n'),
      );
    },
  );

  // --- Structural / graph tools (served from the Postgres symbol index; no user files needed) ---

  const repos = (r?: string[]) => r;

  server.registerTool(
    'find_symbol',
    {
      title: 'Find symbol',
      description: 'Find indexed symbols whose name matches.',
      inputSchema: { name: z.string(), repos: z.array(z.string()).optional() },
    },
    async ({ name, repos: rs }) => {
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
    },
  );

  const roleTool = (tool: string, role: string, label: string) => {
    server.registerTool(
      tool,
      {
        title: label,
        description: `List ${label.toLowerCase()} (optionally filtered by name).`,
        inputSchema: { name: z.string().optional(), repos: z.array(z.string()).optional() },
      },
      async ({ name, repos: rs }) => {
        if (!project) return text(NEED_PROJECT);
        const rows = await services.symbols.findSymbols(project, { role, name, repos: repos(rs) });
        if (rows.length === 0) return text(`No ${role} found.`);
        return text(rows.map((s) => `${s.repo}/${s.file}:${s.startLine}  ${s.name}`).join('\n'));
      },
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
        'List HTTP endpoints (controller routes), optionally filtered by path substring.',
      inputSchema: { path: z.string().optional(), repos: z.array(z.string()).optional() },
    },
    async ({ path, repos: rs }) => {
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
    },
  );

  server.registerTool(
    'summarize_project',
    {
      title: 'Summarize project',
      description: 'High-level stats: file/symbol counts and role breakdown.',
      inputSchema: { repos: z.array(z.string()).optional() },
    },
    async ({ repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const s = await services.symbols.summary(project, repos(rs));
      const roleLines = Object.entries(s.roles)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `  ${role}: ${count}`);
      return text(
        [
          `Repositories (${s.repos.length}): ${s.repos.join(', ') || '(none — reindex first)'}`,
          `Files: ${s.files}`,
          `Symbols: ${s.symbols}`,
          'Roles:',
          ...roleLines,
        ].join('\n'),
      );
    },
  );

  server.registerTool(
    'get_architecture',
    {
      title: 'Get architecture',
      description: 'Modules, controllers with routes, and dependency-injection edges.',
      inputSchema: { repos: z.array(z.string()).optional() },
    },
    async ({ repos: rs }) => {
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
    },
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
      },
      async ({ name, repos: rs }) => {
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
      },
    );
  };
  graphTool(
    'find_dependencies',
    'Find dependencies',
    'What a symbol depends on (direct).',
    (g, n) => g.dependencies(n),
  );
  graphTool('find_dependents', 'Find dependents', 'What depends on a symbol (direct).', (g, n) =>
    g.dependents(n),
  );
  graphTool('impact', 'Impact (blast radius)', 'Transitive dependents of a symbol.', (g, n) =>
    g.impact(n),
  );

  server.registerTool(
    'export_graph',
    {
      title: 'Export dependency graph',
      description: 'Export the dependency graph as JSON (nodes+edges) or Graphviz DOT.',
      inputSchema: {
        format: z.enum(['json', 'dot']).optional(),
        repos: z.array(z.string()).optional(),
      },
    },
    async ({ format, repos: rs }) => {
      if (!project) return text(NEED_PROJECT);
      const graph = await services.symbols.graph(project, repos(rs));
      return text(format === 'dot' ? graph.toDot() : JSON.stringify(graph.toJSON(), null, 2));
    },
  );
}
