import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, type McpConfig, McpContext } from './context';
import { registerResourcesAndPrompts } from './resources';
import { registerTools } from './tools';

/** Server-level usage protocol, surfaced to clients via the MCP `initialize` response. */
export const LOCAL_SERVER_INSTRUCTIONS = `brain-dock — local MCP server for the repositories configured on this machine (one project; repos come from the REPOS/PROJECT_ROOT env).

Protocol:
- Structural tools (find_*, find_endpoint, get_architecture, summarize_project, find_dependencies, find_dependents, impact, export_graph, repo_map) read an in-memory index built on demand; search_code / generate_context / search_everywhere need vectors — run the reindex tool first (and after big code changes).
- repo_map returns a ranked one-call overview of the codebase. Use find_symbol to locate a symbol, then pass its exact name to impact / find_dependencies / find_dependents.
- search_everywhere spans code + memory + knowledge + documents; search_code is code-only.
- Persist durable facts with remember (short facts/decisions) or save_knowledge (titled entries); memory/knowledge/document tools require DATABASE_URL.`;

/** Build a fully-configured brain-dock MCP server (tools/resources/prompts registered). */
export function createMcpServer(config: McpConfig = loadConfig()): McpServer {
  const server = new McpServer(
    { name: 'brain-dock', version: '0.1.0' },
    { instructions: LOCAL_SERVER_INSTRUCTIONS },
  );
  const context = new McpContext(config);
  registerTools(server, context);
  registerResourcesAndPrompts(server, context);
  return server;
}
