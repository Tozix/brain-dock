#!/usr/bin/env bun
// Live check: spawn the brain-dock MCP server over stdio and exercise its tools
// through a real MCP client. Requires Qdrant up for the search tools.
// Usage: bun apps/mcp/src/client-check.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'bun',
  args: ['apps/mcp/src/index.ts'],
  env: {
    ...process.env,
    PROJECT_ROOT: 'apps/api/src',
    PROJECT_ID: 'brain-dock',
    COLLECTION: 'code_mcp',
    EMBEDDER: process.env.EMBEDDER ?? 'deterministic',
  },
});

const client = new Client({ name: 'brain-dock-check', version: '0.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const first = (result.content as Array<{ type: string; text?: string }>)[0];
  return first?.text ?? '';
}

console.log(`\n# summarize_project\n${await call('summarize_project')}`);
console.log(`\n# get_architecture\n${await call('get_architecture')}`);
console.log(`\n# reindex\n${await call('reindex')}`);
console.log(
  `\n# search_code "jwt access token guard"\n${await call('search_code', { query: 'jwt access token guard', limit: 5 })}`,
);

// Project Memory & Knowledge (require DATABASE_URL).
console.log(
  `\n# remember\n${await call('remember', { content: 'We run NestJS on the Bun runtime; emitDecoratorMetadata needs a root tsconfig.', type: 'DECISION', tags: ['bun', 'nestjs'] })}`,
);
console.log(
  `\n# search_memory "how do we run nestjs"\n${await call('search_memory', { query: 'how do we run nestjs', limit: 3 })}`,
);
console.log(
  `\n# save_knowledge\n${await call('save_knowledge', { title: 'Auth model', content: 'JWT access + refresh, RBAC USER<ADMIN<SUPER_ADMIN, API keys issued by Super Admin.', type: 'ARCHITECTURE' })}`,
);
console.log(
  `\n# search_knowledge "role based access"\n${await call('search_knowledge', { query: 'role based access control', limit: 3 })}`,
);
console.log(
  `\n# save_document\n${await call('save_document', { title: 'Ops runbook', format: 'MD', content: '# Ops\n\nStart infra with docker compose. Postgres, Qdrant, Redis and Ollama must be healthy before reindexing.' })}`,
);
console.log(
  `\n# search_everywhere "how to run the project and auth"\n${await call('search_everywhere', { query: 'how to run the project and authentication', limit: 6 })}`,
);

await client.close();
