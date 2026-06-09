import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from './context';

function architectureText(ctx: McpContext): string {
  const index = ctx.getIndex();
  const modules: string[] = [];
  const controllers: string[] = [];
  for (const file of index.files) {
    for (const symbol of file.symbols) {
      if (symbol.nestRole === 'module') modules.push(symbol.name);
      if (symbol.nestRole === 'controller') controllers.push(symbol.name);
    }
  }
  return [
    `Project root: ${ctx.config.projectRoot}`,
    `Files: ${index.stats.files}, symbols: ${index.stats.symbols}, relations: ${index.stats.relations}`,
    `Modules (${modules.length}): ${modules.join(', ')}`,
    `Controllers (${controllers.length}): ${controllers.join(', ')}`,
  ].join('\n');
}

/** Register MCP resources and prompts (alongside the tools). */
export function registerResourcesAndPrompts(server: McpServer, ctx: McpContext): void {
  server.registerResource(
    'architecture',
    'brain-dock://architecture',
    {
      title: 'Project architecture',
      description: 'Modules, controllers and stats for the configured project.',
      mimeType: 'text/plain',
    },
    (uri) => ({ contents: [{ uri: uri.href, text: architectureText(ctx) }] }),
  );

  server.registerPrompt(
    'onboard',
    {
      title: 'Onboard to this project',
      description: 'Ask the model to summarize the project using brain-dock tools.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Summarize this project. Call summarize_project and get_architecture, then describe the main modules, controllers and how requests flow through the system.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'explain_symbol',
    {
      title: 'Explain a symbol',
      description: 'Explain a code symbol and its dependencies.',
      argsSchema: { name: z.string().describe('Symbol name to explain') },
    },
    ({ name }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Explain the symbol "${name}". Use find_symbol to locate it and search_code/generate_context for context, then describe its responsibility, dependencies and where it is used.`,
          },
        },
      ],
    }),
  );
}
