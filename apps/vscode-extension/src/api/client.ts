// Thin client for the brain-dock hosted server: REST over `x-api-key`, MCP tools over Bearer.
import {
  type IndexStatus,
  normalizeBase,
  type Project,
  parseSummary,
  type Repository,
  toolText,
} from '../util';

export interface ClientOptions {
  serverUrl: string;
  mcpUrl: string;
  apiKey: string;
  project: string;
}

export class BrainDockClient {
  private readonly base: string;

  constructor(private readonly opts: ClientOptions) {
    this.base = `${normalizeBase(opts.serverUrl)}/api/v1`;
  }

  listProjects(): Promise<Project[]> {
    return this.rest<Project[]>('GET', '/projects');
  }

  listRepositories(projectId: string): Promise<Repository[]> {
    return this.rest<Repository[]>('GET', `/projects/${projectId}/repositories`);
  }

  reindex(projectId: string, repoId: string): Promise<unknown> {
    return this.rest('POST', `/projects/${projectId}/repositories/${repoId}/reindex`);
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

  private async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'x-api-key': this.opts.apiKey, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${res.statusText}`);
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
    });
    if (!res.ok) throw new Error(`MCP ${name} → ${res.status} ${res.statusText}`);
    return toolText(await res.text());
  }
}
