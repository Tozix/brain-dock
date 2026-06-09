#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server';

// stdio transport: stdout carries the JSON-RPC protocol, so logs must go to stderr only.
async function main(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  console.error('[brain-dock:mcp] server connected over stdio');
}

main().catch((error) => {
  console.error('[brain-dock:mcp] fatal:', error);
  process.exit(1);
});
