import type { Prisma, PrismaClient } from '@brain-dock/db';
import { SymbolGraph } from '@brain-dock/graph';
import type { RepositoryIndex, RouteInfo } from '@brain-dock/indexer';

export interface SymbolScope {
  projectId: string;
  repo: string;
}

export interface SymbolRow {
  repo: string;
  name: string;
  kind: string;
  role: string;
  file: string;
  startLine: number;
  routes: RouteInfo[];
}

export interface EndpointRow {
  repo: string;
  method: string;
  path: string;
  handler: string;
  controller: string;
  file: string;
}

export interface ProjectSummary {
  files: number;
  symbols: number;
  edges: number;
  roles: Record<string, number>;
  repos: string[];
}

/**
 * Server-side structural index: persists the indexer's symbols/edges to Postgres so the hosted MCP
 * can answer find/architecture/graph queries without the user's files. Scoped by project + repo alias.
 */
export class SymbolIndexService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Replace the stored symbols/edges for one repo with the given index. */
  async persist(
    scope: SymbolScope,
    index: RepositoryIndex,
  ): Promise<{ symbols: number; edges: number }> {
    const symbols = index.files.flatMap((file) =>
      file.symbols.map((s) => ({
        projectId: scope.projectId,
        repo: scope.repo,
        name: s.name,
        kind: s.kind,
        role: s.nestRole,
        file: file.path,
        startLine: s.startLine,
        endLine: s.endLine,
        routes: s.routes.length > 0 ? (s.routes as unknown as Prisma.InputJsonValue) : undefined,
      })),
    );
    const edges = index.files.flatMap((file) =>
      file.relations.map((r) => ({
        projectId: scope.projectId,
        repo: scope.repo,
        fromName: r.from,
        toName: r.to,
        kind: r.kind,
      })),
    );

    await this.prisma.$transaction([
      this.prisma.codeSymbol.deleteMany({
        where: { projectId: scope.projectId, repo: scope.repo },
      }),
      this.prisma.codeEdge.deleteMany({ where: { projectId: scope.projectId, repo: scope.repo } }),
      this.prisma.codeSymbol.createMany({ data: symbols }),
      this.prisma.codeEdge.createMany({ data: edges }),
    ]);
    return { symbols: symbols.length, edges: edges.length };
  }

  private repoFilter(repos?: string[]) {
    return repos && repos.length > 0 ? { in: repos } : undefined;
  }

  async findSymbols(
    projectId: string,
    opts: { name?: string; role?: string; repos?: string[] } = {},
  ): Promise<SymbolRow[]> {
    const rows = await this.prisma.codeSymbol.findMany({
      where: {
        projectId,
        repo: this.repoFilter(opts.repos),
        role: opts.role,
        name: opts.name ? { contains: opts.name, mode: 'insensitive' } : undefined,
      },
      orderBy: [{ repo: 'asc' }, { file: 'asc' }, { startLine: 'asc' }],
    });
    return rows.map((r) => ({
      repo: r.repo,
      name: r.name,
      kind: r.kind,
      role: r.role,
      file: r.file,
      startLine: r.startLine,
      routes: (r.routes as RouteInfo[] | null) ?? [],
    }));
  }

  async endpoints(
    projectId: string,
    opts: { path?: string; repos?: string[] } = {},
  ): Promise<EndpointRow[]> {
    const controllers = await this.findSymbols(projectId, {
      role: 'controller',
      repos: opts.repos,
    });
    const needle = opts.path?.toLowerCase();
    const out: EndpointRow[] = [];
    for (const c of controllers) {
      for (const route of c.routes) {
        const path = route.path || '/';
        if (needle && !path.toLowerCase().includes(needle)) continue;
        out.push({
          repo: c.repo,
          method: route.method,
          path,
          handler: route.handler,
          controller: c.name,
          file: c.file,
        });
      }
    }
    return out;
  }

  async summary(projectId: string, repos?: string[]): Promise<ProjectSummary> {
    const [rows, edges] = await Promise.all([
      this.prisma.codeSymbol.findMany({
        where: { projectId, repo: this.repoFilter(repos) },
        select: { role: true, file: true, repo: true },
      }),
      this.prisma.codeEdge.count({ where: { projectId, repo: this.repoFilter(repos) } }),
    ]);
    const roles: Record<string, number> = {};
    const files = new Set<string>();
    const repoSet = new Set<string>();
    for (const r of rows) {
      if (r.role !== 'none') roles[r.role] = (roles[r.role] ?? 0) + 1;
      files.add(`${r.repo}/${r.file}`);
      repoSet.add(r.repo);
    }
    return { files: files.size, symbols: rows.length, edges, roles, repos: [...repoSet].sort() };
  }

  /** Build a dependency graph for the project from the stored symbols + edges. */
  async graph(projectId: string, repos?: string[]): Promise<SymbolGraph> {
    const [symbols, edges] = await Promise.all([
      this.prisma.codeSymbol.findMany({
        where: { projectId, repo: this.repoFilter(repos) },
        select: { name: true, kind: true, role: true, file: true, repo: true },
      }),
      this.prisma.codeEdge.findMany({
        where: { projectId, repo: this.repoFilter(repos) },
        select: { fromName: true, toName: true, kind: true },
      }),
    ]);
    const graph = new SymbolGraph();
    for (const s of symbols) {
      graph.addNode({
        name: s.name,
        kind: s.kind,
        role: s.role,
        file: s.file,
        repo: s.repo,
        internal: true,
      });
    }
    for (const e of edges) {
      graph.addEdge(
        e.fromName,
        e.toName,
        e.kind as 'injects' | 'extends' | 'implements' | 'imports',
      );
    }
    return graph;
  }
}
