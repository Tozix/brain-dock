import { DOC_FORMATS, KNOWLEDGE_TYPES, MEMORY_TYPES } from '@brain-dock/knowledge';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listUserProjects, type RemotePrincipal } from './auth';
import type { RemoteServices } from './services';

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

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
}
