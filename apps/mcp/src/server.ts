import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, type McpConfig, McpContext } from './context';
import { registerResourcesAndPrompts } from './resources';
import { registerTools } from './tools';

/** Build a fully-configured brain-dock MCP server (tools/resources/prompts registered). */
export function createMcpServer(config: McpConfig = loadConfig()): McpServer {
  const server = new McpServer({ name: 'brain-dock', version: '0.1.0' });
  const context = new McpContext(config);
  registerTools(server, context);
  registerResourcesAndPrompts(server, context);
  return server;
}
