import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveProject, resolveUser } from './auth';
import { FixedWindowLimiter } from './rate-limit';
import type { RemoteServices } from './services';
import { registerRemoteTools } from './tools';

export interface RemoteMcpOptions {
  /** Per-API-key request cap per window (default 600). */
  rateLimitMax?: number;
  /** Rate-limit window in ms (default 60000). */
  rateLimitWindowMs?: number;
}

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
export function createRemoteMcpHandler(services: RemoteServices, opts: RemoteMcpOptions = {}) {
  const limiter = new FixedWindowLimiter(
    opts.rateLimitMax ?? 600,
    opts.rateLimitWindowMs ?? 60_000,
  );

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname !== '/mcp') return json(404, { error: 'not found' });

    const principal = await resolveUser(services.prisma, bearerKey(req));
    if (!principal) return json(401, { error: 'invalid or missing API key' });

    // Per-key rate limit (after auth so we key by the owner, and unauthenticated calls are cheap).
    const decision = limiter.hit(principal.userId, Date.now());
    if (!decision.allowed) {
      const retryAfter = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
      return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) },
      });
    }

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
