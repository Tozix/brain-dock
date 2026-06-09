import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveProject, resolveUser } from './auth';
import type { RemoteServices } from './services';
import { registerRemoteTools } from './tools';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bearerKey(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.headers.get('x-api-key') ?? '';
}

/**
 * Build the hosted-MCP fetch handler. Each request: authenticate the API key (→ user), resolve the
 * optional `X-Project` header to an owned project, then handle the MCP call over a stateless
 * Streamable-HTTP transport with only that user/project's tools registered.
 */
export function createRemoteMcpHandler(services: RemoteServices) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname !== '/mcp') return json(404, { error: 'not found' });

    const principal = await resolveUser(services.prisma, bearerKey(req));
    if (!principal) return json(401, { error: 'invalid or missing API key' });

    const ref = req.headers.get('x-project');
    let projectId: string | null = null;
    if (ref) {
      const project = await resolveProject(services.prisma, principal.userId, ref);
      if (!project) return json(403, { error: `unknown project "${ref}"` });
      projectId = project.id;
    }

    // Stateless: a fresh server + transport per request.
    const server = new McpServer({ name: 'brain-dock', version: '0.1.0' });
    registerRemoteTools(server, services, { principal, projectId });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  };
}
