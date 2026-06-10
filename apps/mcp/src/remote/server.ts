import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveProject, resolveUser } from './auth';
import { FixedWindowLimiter } from './rate-limit';
import type { RemoteServices } from './services';
import { REMOTE_SERVER_INSTRUCTIONS, registerRemoteTools } from './tools';

/**
 * `/mcp` or `/mcp/{project-slug-or-id}` — the URL segment selects the project for clients that
 * cannot send custom headers (it takes precedence over `X-Project`).
 */
const MCP_PATH_RE = /^\/mcp(?:\/([A-Za-z0-9._-]+))?$/;

export interface RemoteMcpOptions {
  /** Per-API-key request cap per window when the key has no own `rateLimit` (default 600). */
  rateLimitMax?: number;
  /** Rate-limit window in ms (default 60000). */
  rateLimitWindowMs?: number;
  /** Pre-auth per-IP request cap per window — caps DB lookups for invalid keys (default 120). */
  ipRateLimitMax?: number;
  /** Pre-auth per-IP window in ms (default 60000). */
  ipRateLimitWindowMs?: number;
  /** Reject requests whose Content-Length exceeds this many bytes with 413 (default 4_000_000). */
  maxBodyBytes?: number;
  /** Give up on a hung MCP handler after this many ms and answer 504 (default 60000). */
  requestTimeoutMs?: number;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function tooManyRequests(resetAt: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return json(429, { error: 'rate limit exceeded' }, { 'retry-after': String(retryAfter) });
}

function bearerKey(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.headers.get('x-api-key') ?? '';
}

/** First X-Forwarded-For hop, else the socket address supplied by the caller, else "unknown". */
function clientIpOf(req: Request, socketIp?: string): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first || socketIp || 'unknown';
}

/**
 * Build the hosted-MCP fetch handler. Each request: authenticate the API key (→ user), resolve the
 * optional `X-Project` header to an owned project, then handle the MCP call over a stateless
 * Streamable-HTTP transport with only that user/project's tools registered.
 *
 * `socketIp` (optional) is the peer address from the HTTP server — used for pre-auth IP limiting
 * when no `X-Forwarded-For` header is present.
 */
export function createRemoteMcpHandler(services: RemoteServices, opts: RemoteMcpOptions = {}) {
  const defaultKeyMax = opts.rateLimitMax ?? 600;
  const keyLimiter = new FixedWindowLimiter(defaultKeyMax, opts.rateLimitWindowMs ?? 60_000);
  const ipLimiter = new FixedWindowLimiter(
    opts.ipRateLimitMax ?? 120,
    opts.ipRateLimitWindowMs ?? 60_000,
  );
  const maxBodyBytes = opts.maxBodyBytes ?? 4_000_000;
  const requestTimeoutMs = opts.requestTimeoutMs ?? 60_000;

  return async function handle(req: Request, socketIp?: string): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    const pathMatch = MCP_PATH_RE.exec(url.pathname);
    if (!pathMatch) return json(404, { error: 'not found' });

    // Stateless transport: only POST carries MCP traffic. Answer GET (SSE) / DELETE with 405 up
    // front — before any transport exists — so clients don't loop on open-then-closed streams.
    if (req.method !== 'POST') {
      return json(405, { error: 'method not allowed' }, { allow: 'POST' });
    }

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return json(413, { error: `request body too large (max ${maxBodyBytes} bytes)` });
    }

    // Pre-auth IP limit: every invalid key still costs a Postgres lookup, so cap by source first.
    const ipDecision = ipLimiter.hit(clientIpOf(req, socketIp), Date.now());
    if (!ipDecision.allowed) return tooManyRequests(ipDecision.resetAt);

    const principal = await resolveUser(services.prisma, bearerKey(req));
    if (!principal) return json(401, { error: 'invalid or missing API key' });

    // Per-key rate limit (after auth so we key by the API key; its own rateLimit wins).
    const decision = keyLimiter.hit(
      principal.keyId,
      Date.now(),
      principal.rateLimit ?? defaultKeyMax,
    );
    if (!decision.allowed) return tooManyRequests(decision.resetAt);

    // Project selection: the /mcp/{slug-or-id} URL segment wins over the X-Project header
    // (some MCP clients cannot send custom headers — the URL is their only knob).
    const ref = pathMatch[1] ?? req.headers.get('x-project');
    let projectId: string | null = null;
    if (ref) {
      const project = await resolveProject(services.prisma, principal.userId, ref);
      if (!project) return json(403, { error: `unknown project "${ref}"` });
      projectId = project.id;
    }

    // Stateless: a fresh server + transport per request.
    const server = new McpServer(
      { name: 'brain-dock', version: '0.1.0' },
      { instructions: REMOTE_SERVER_INSTRUCTIONS },
    );
    registerRemoteTools(server, services, { principal, projectId });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // A hung tool handler must not pin the HTTP request forever: race against a deadline.
      const outcome = await Promise.race([
        transport.handleRequest(req),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), requestTimeoutMs);
        }),
      ]);
      if (outcome === 'timeout') {
        console.error(`[mcp:http] request timed out after ${requestTimeoutMs}ms`);
        return json(504, { error: 'request timed out' });
      }
      return outcome;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  };
}
