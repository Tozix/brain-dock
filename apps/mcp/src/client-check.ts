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

await client.close();
