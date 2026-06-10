// Thin client for the brain-dock hosted server: REST over `x-api-key`, MCP tools over Bearer.
import {
  type FileContent,
  type IndexStatus,
  type IndexUploadReport,
  normalizeBase,
  type Project,
  parseSummary,
  type Repository,
  toolText,
  type UsageSummary,
} from '../util';

export interface ClientOptions {
  serverUrl: string;
  mcpUrl: string;
  apiKey: string;
  project: string;
}

const REQUEST_TIMEOUT_MS = 15_000;
const INDEX_TIMEOUT_MS = 120_000; // file upload + server-side indexing is legitimately slow

/** HTTP-level failure: carries the status so callers can branch (e.g. retry only on 409). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** "GET /projects → 404 Not Found: {...body excerpt...}" */
async function httpError(prefix: string, res: Response): Promise<ApiError> {
  const body = (await res.text().catch(() => '')).trim();
  const detail = body ? `: ${body.slice(0, 300)}` : '';
  return new ApiError(`${prefix} → ${res.status} ${res.statusText}${detail}`, res.status);
}

export class BrainDockClient {
  private readonly base: string;

  constructor(private readonly opts: ClientOptions) {
    this.base = `${normalizeBase(opts.serverUrl)}/api/v1`;
  }

  listProjects(): Promise<Project[]> {
    return this.rest<Project[]>('GET', '/projects');
  }

  createProject(name: string, slug: string): Promise<Project> {
    return this.rest<Project>('POST', '/projects', { name: name.slice(0, 100), slug });
  }

  listRepositories(projectId: string): Promise<Repository[]> {
    return this.rest<Repository[]>('GET', `/projects/${projectId}/repositories`);
  }

  reindex(projectId: string, repoId: string): Promise<unknown> {
    return this.rest('POST', `/projects/${projectId}/repositories/${repoId}/reindex`);
  }

  /** Upload file contents to be indexed server-side (no git / server path needed). */
  indexFiles(projectId: string, repoId: string, files: FileContent[]): Promise<IndexUploadReport> {
    return this.rest<IndexUploadReport>(
      'POST',
      `/projects/${projectId}/repositories/${repoId}/index`,
      { files },
      INDEX_TIMEOUT_MS,
    );
  }

  getUsage(days = 30): Promise<UsageSummary> {
    return this.rest<UsageSummary>('GET', `/usage?days=${days}`);
  }

  createRepository(
    projectId: string,
    dto: { name: string; alias: string; root: string },
  ): Promise<Repository> {
    return this.rest<Repository>('POST', `/projects/${projectId}/repositories`, dto);
  }

  /** Index status for the active project, derived from the MCP `summarize_project` tool. */
  async indexStatus(): Promise<IndexStatus> {
    return parseSummary(await this.callTool('summarize_project', {}));
  }

  generateContext(query: string): Promise<string> {
    return this.callTool('generate_context', { query });
  }

  private async rest<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'x-api-key': this.opts.apiKey, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw await httpError(`${method} ${path}`, res);
    return (await res.json()) as T;
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.opts.project) throw new Error('No project selected — pick one first.');
    const res = await fetch(this.opts.mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        'x-project': this.opts.project,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw await httpError(`MCP ${name}`, res);
    return toolText(await res.text());
  }
}
