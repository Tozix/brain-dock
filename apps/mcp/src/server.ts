import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, type McpConfig, McpContext } from './context';
import { registerTools } from './tools';

/** Build a fully-configured brain-dock MCP server (tools registered, not yet connected). */
export function createMcpServer(config: McpConfig = loadConfig()): McpServer {
  const server = new McpServer({ name: 'brain-dock', version: '0.1.0' });
  registerTools(server, new McpContext(config));
  return server;
}
