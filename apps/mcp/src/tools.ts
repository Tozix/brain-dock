import type { RepositoryIndex } from '@brain-dock/indexer';
import { DOC_FORMATS, KNOWLEDGE_TYPES, MEMORY_TYPES } from '@brain-dock/knowledge';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from './context';

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

function findByRole(index: RepositoryIndex, role: string, name?: string): string[] {
  const needle = name?.toLowerCase();
  const out: string[] = [];
  for (const file of index.files) {
    for (const symbol of file.symbols) {
      if (symbol.nestRole !== role) continue;
      if (needle && !symbol.name.toLowerCase().includes(needle)) continue;
      out.push(`${file.path}:${symbol.startLine}  ${symbol.name}`);
    }
  }
  return out;
}

function listOrEmpty(lines: string[], emptyMessage: string): string {
  return lines.length > 0 ? lines.join('\n') : emptyMessage;
}

export function registerTools(server: McpServer, ctx: McpContext): void {
  const { projectId, collection } = ctx.config;

  // --- Vector / context tools (require an ingested Qdrant collection) ---

  server.registerTool(
    'reindex',
    {
      title: 'Reindex project',
      description:
        'Index the project and upsert embeddings into the vector store. Run before search tools.',
    },
    async () => {
      const report = await ctx.ingestion.ingestRepository(ctx.config.projectRoot, {
        projectId,
        collection,
      });
      ctx.refreshIndex();
      return text(`Reindexed ${report.files} files, ${report.chunks} chunks into "${collection}".`);
    },
  );

  server.registerTool(
    'search_code',
    {
      title: 'Search code',
      description: 'Hybrid (vector + keyword) search over indexed code symbols.',
      inputSchema: {
        query: z.string().describe('Natural-language or keyword query'),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ query, limit }) => {
      try {
        const results = await ctx.search.search(query, {
          projectId,
          collection,
          limit: limit ?? 10,
        });
        if (results.length === 0) return text('No results. Run the "reindex" tool first.');
        return text(
          results
            .map((r) => `${r.score.toFixed(3)}  ${r.role} ${r.symbol}  (${r.path}:${r.startLine})`)
            .join('\n'),
        );
      } catch (error) {
        return text(`Search failed (${(error as Error).message}). Run the "reindex" tool first.`);
      }
    },
  );

  server.registerTool(
    'generate_context',
    {
      title: 'Generate context',
      description: 'Build a budget-bounded, intent-aware context block for a query (for an LLM).',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(20).optional(),
        maxChars: z.number().int().positive().max(20000).optional(),
      },
    },
    async ({ query, limit, maxChars }) => {
      try {
        const result = await ctx.context.buildContext(query, {
          projectId,
          collection,
          limit: limit ?? 8,
          maxChars: maxChars ?? 6000,
        });
        return text(result.text);
      } catch (error) {
        return text(
          `Context build failed (${(error as Error).message}). Run the "reindex" tool first.`,
        );
      }
    },
  );

  // --- Structural tools (use the in-memory index; no Qdrant needed) ---

  server.registerTool(
    'find_symbol',
    {
      title: 'Find symbol',
      description: 'Find symbols (any kind) whose name matches.',
      inputSchema: { name: z.string().describe('Symbol name or substring') },
    },
    async ({ name }) => {
      const needle = name.toLowerCase();
      const lines: string[] = [];
      for (const file of ctx.getIndex().files) {
        for (const symbol of file.symbols) {
          if (!symbol.name.toLowerCase().includes(needle)) continue;
          const role = symbol.nestRole !== 'none' ? `${symbol.nestRole} ` : '';
          lines.push(`${file.path}:${symbol.startLine}  ${role}${symbol.kind} ${symbol.name}`);
        }
      }
      return text(listOrEmpty(lines, `No symbol matching "${name}".`));
    },
  );

  const roleTool = (tool: string, role: string, label: string) => {
    server.registerTool(
      tool,
      {
        title: label,
        description: `List ${label.toLowerCase()} (optionally filtered by name).`,
        inputSchema: { name: z.string().optional() },
      },
      async ({ name }) =>
        text(listOrEmpty(findByRole(ctx.getIndex(), role, name), `No ${role} found.`)),
    );
  };
  roleTool('find_controller', 'controller', 'Controllers');
  roleTool('find_service', 'service', 'Services');
  roleTool('find_module', 'module', 'Modules');

  server.registerTool(
    'summarize_project',
    {
      title: 'Summarize project',
      description: 'High-level stats: file/symbol counts and role breakdown.',
    },
    async () => {
      const index = ctx.getIndex();
      const roles = new Map<string, number>();
      for (const file of index.files) {
        for (const symbol of file.symbols) {
          if (symbol.nestRole !== 'none')
            roles.set(symbol.nestRole, (roles.get(symbol.nestRole) ?? 0) + 1);
        }
      }
      const roleLines = [...roles]
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `  ${role}: ${count}`);
      return text(
        [
          `Project: ${projectId}`,
          `Root: ${ctx.config.projectRoot}`,
          `Files: ${index.stats.files}`,
          `Symbols: ${index.stats.symbols}`,
          `Relations: ${index.stats.relations}`,
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
    },
    async () => {
      const index = ctx.getIndex();
      const modules: string[] = [];
      const controllers: string[] = [];
      const edges: string[] = [];

      for (const file of index.files) {
        for (const symbol of file.symbols) {
          if (symbol.nestRole === 'module') modules.push(symbol.name);
          if (symbol.nestRole === 'controller') {
            const routes = symbol.routes
              .map((r) => `${r.method.toUpperCase()} ${r.path || '/'} → ${r.handler}`)
              .join(', ');
            controllers.push(`${symbol.name}${routes ? ` [${routes}]` : ''}`);
          }
        }
        for (const rel of file.relations) {
          if (rel.kind === 'injects') edges.push(`${rel.from} → ${rel.to}`);
        }
      }

      return text(
        [
          `Modules (${modules.length}): ${modules.join(', ')}`,
          '',
          'Controllers:',
          ...controllers.map((c) => `  ${c}`),
          '',
          `DI edges (${edges.length}):`,
          ...edges.slice(0, 40).map((e) => `  ${e}`),
        ].join('\n'),
      );
    },
  );

  // --- Project Memory & Knowledge Base (require DATABASE_URL) ---

  const NO_DB = 'Memory/knowledge tools require DATABASE_URL to be configured.';

  server.registerTool(
    'remember',
    {
      title: 'Remember',
      description: 'Save a long-term project memory (decision/fact/note/todo).',
      inputSchema: {
        content: z.string().describe('What to remember'),
        type: z.enum(MEMORY_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ content, type, tags }) => {
      if (!ctx.memory) return text(NO_DB);
      const item = await ctx.memory.remember({ projectId, content, type, tags });
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
      if (!ctx.memory) return text(NO_DB);
      const hits = await ctx.memory.search(projectId, query, limit ?? 10);
      if (hits.length === 0) return text('No matching memories.');
      return text(
        hits.map((h) => `${h.score.toFixed(3)}  [${h.item.type}] ${h.item.content}`).join('\n'),
      );
    },
  );

  server.registerTool(
    'list_memory',
    {
      title: 'List memory',
      description: 'List recent project memories.',
    },
    async () => {
      if (!ctx.memory) return text(NO_DB);
      const items = await ctx.memory.list(projectId);
      if (items.length === 0) return text('No memories yet.');
      return text(items.map((i) => `[${i.type}] ${i.content}`).join('\n'));
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
      if (!ctx.knowledge) return text(NO_DB);
      const item = await ctx.knowledge.save({ projectId, title, content, type, tags });
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
      if (!ctx.knowledge) return text(NO_DB);
      const hits = await ctx.knowledge.search(projectId, query, limit ?? 10);
      if (hits.length === 0) return text('No matching knowledge.');
      return text(
        hits.map((h) => `${h.score.toFixed(3)}  [${h.item.type}] ${h.item.title}`).join('\n'),
      );
    },
  );

  // --- Documents (require DATABASE_URL) ---

  server.registerTool(
    'save_document',
    {
      title: 'Save document',
      description: 'Ingest a text document (md/txt/mdx/json/yaml): stored, chunked and embedded.',
      inputSchema: {
        title: z.string(),
        content: z.string(),
        format: z.enum(DOC_FORMATS).optional(),
        source: z.string().optional(),
      },
    },
    async ({ title, content, format, source }) => {
      if (!ctx.documents) return text(NO_DB);
      const { document, chunks } = await ctx.documents.ingest({
        projectId,
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
      if (!ctx.documents) return text(NO_DB);
      const hits = await ctx.documents.search(projectId, query, limit ?? 10);
      if (hits.length === 0) return text('No matching documents.');
      return text(
        hits
          .map((h) => `${h.score.toFixed(3)}  [${h.document.format}] ${h.document.title}`)
          .join('\n'),
      );
    },
  );

  server.registerTool(
    'list_documents',
    {
      title: 'List documents',
      description: 'List documents in the project.',
    },
    async () => {
      if (!ctx.documents) return text(NO_DB);
      const docs = await ctx.documents.list(projectId);
      if (docs.length === 0) return text('No documents yet.');
      return text(docs.map((d) => `[${d.format}] ${d.title}`).join('\n'));
    },
  );

  // --- Unified search across all sources ---

  server.registerTool(
    'search_everywhere',
    {
      title: 'Search everywhere',
      description: 'One query across code + memory + knowledge + documents, ranked together.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
    },
    async ({ query, limit }) => {
      const results = await ctx.unified.search(query, {
        projectId,
        codeCollection: collection,
        limit: limit ?? 10,
      });
      if (results.length === 0) return text('No results across any source.');
      return text(
        results
          .map(
            (r) => `${r.score.toFixed(3)}  [${r.source}] ${r.title} — ${r.ref}\n    ${r.snippet}`,
          )
          .join('\n'),
      );
    },
  );

  // --- CRUD: update / delete (require DATABASE_URL) ---

  server.registerTool(
    'update_memory',
    {
      title: 'Update memory',
      description: 'Update a memory item by id (only your project).',
      inputSchema: {
        id: z.string(),
        content: z.string().optional(),
        type: z.enum(MEMORY_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ id, content, type, tags }) => {
      if (!ctx.memory) return text(NO_DB);
      const item = await ctx.memory.update(projectId, id, { content, type, tags });
      return text(item ? `Updated memory ${item.id}` : `Memory not found: ${id}`);
    },
  );

  server.registerTool(
    'delete_memory',
    {
      title: 'Delete memory',
      description: 'Delete a memory item by id.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      if (!ctx.memory) return text(NO_DB);
      return text(
        (await ctx.memory.delete(projectId, id)) ? `Deleted memory ${id}` : `Not found: ${id}`,
      );
    },
  );

  server.registerTool(
    'update_knowledge',
    {
      title: 'Update knowledge',
      description: 'Update a knowledge entry by id.',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ id, title, content, type, tags }) => {
      if (!ctx.knowledge) return text(NO_DB);
      const item = await ctx.knowledge.update(projectId, id, { title, content, type, tags });
      return text(item ? `Updated knowledge ${item.id}` : `Knowledge not found: ${id}`);
    },
  );

  server.registerTool(
    'delete_knowledge',
    {
      title: 'Delete knowledge',
      description: 'Delete a knowledge entry by id.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      if (!ctx.knowledge) return text(NO_DB);
      return text(
        (await ctx.knowledge.delete(projectId, id))
          ? `Deleted knowledge ${id}`
          : `Not found: ${id}`,
      );
    },
  );

  server.registerTool(
    'delete_document',
    {
      title: 'Delete document',
      description: 'Delete a document and its chunks by id.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      if (!ctx.documents) return text(NO_DB);
      return text(
        (await ctx.documents.delete(projectId, id)) ? `Deleted document ${id}` : `Not found: ${id}`,
      );
    },
  );
}
