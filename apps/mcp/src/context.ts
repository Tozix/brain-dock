import { createPrismaClient } from '@brain-dock/db';
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import { SymbolGraph } from '@brain-dock/graph';
import { type RepositoryIndex, RepositoryIndexer } from '@brain-dock/indexer';
import { DocumentService, KnowledgeService, MemoryService } from '@brain-dock/knowledge';
import {
  ContextEngine,
  DEFAULT_REPO,
  IngestionService,
  SearchService,
  UnifiedSearchService,
} from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

/** One repository within the configured project. */
export interface RepoConfig {
  /** Human-readable, stable alias used for filtering (e.g. "api", "web"). */
  alias: string;
  /** Absolute or cwd-relative path to the repository root. */
  root: string;
}

export interface McpConfig {
  /** Fallback single-repo root, used when `repos` is empty. */
  projectRoot: string;
  projectId: string;
  collection: string;
  /** Multi-repo layout; when empty a single repo is derived from `projectRoot`. */
  repos?: RepoConfig[];
  qdrantUrl: string;
  ollamaUrl: string;
  embeddingModel: string;
  embedder: 'ollama' | 'deterministic';
  /** Empty disables memory/knowledge tools (they require Postgres). */
  databaseUrl: string;
}

/** Parse the `REPOS` env (JSON: `[{"alias":"api","root":"./apps/api"}]`); [] on absence/parse error. */
function parseRepos(raw: string | undefined): RepoConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RepoConfig => typeof r?.alias === 'string' && typeof r?.root === 'string')
      .map((r) => ({ alias: r.alias, root: r.root }));
  } catch {
    return [];
  }
}

export function loadConfig(): McpConfig {
  return {
    projectRoot: process.env.PROJECT_ROOT ?? process.cwd(),
    projectId: process.env.PROJECT_ID ?? 'default',
    collection: process.env.COLLECTION ?? 'code',
    repos: parseRepos(process.env.REPOS),
    qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:16333',
    ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    embeddingModel: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
    embedder: process.env.EMBEDDER === 'ollama' ? 'ollama' : 'deterministic',
    databaseUrl: process.env.DATABASE_URL ?? '',
  };
}

function makeEmbedder(config: McpConfig): EmbeddingProvider {
  return config.embedder === 'ollama'
    ? new OllamaEmbeddingProvider({
        url: config.ollamaUrl,
        model: config.embeddingModel,
        dimensions: 768,
      })
    : new DeterministicEmbeddingProvider(256);
}

const INCLUDE = (p: string) => !p.includes('.test.') && !p.includes('.spec.');

/** Shared services + a lazily-built, cached repository index for the configured project. */
export class McpContext {
  readonly ingestion: IngestionService;
  readonly search: SearchService;
  readonly context: ContextEngine;
  /** Present only when DATABASE_URL is configured. */
  readonly memory?: MemoryService;
  readonly knowledge?: KnowledgeService;
  readonly documents?: DocumentService;
  /** Unified search across code + memory + knowledge + documents. */
  readonly unified: UnifiedSearchService;
  /** Normalized repository list (always ≥ 1 entry). */
  readonly repos: RepoConfig[];
  private readonly indexer = new RepositoryIndexer();
  private readonly indexCache = new Map<string, RepositoryIndex>();
  private readonly graphCache = new Map<string, SymbolGraph>();

  constructor(readonly config: McpConfig) {
    this.repos =
      config.repos && config.repos.length > 0
        ? config.repos
        : [{ alias: DEFAULT_REPO, root: config.projectRoot }];
    const embedder = makeEmbedder(config);
    const store = new QdrantStore({ url: config.qdrantUrl });
    this.ingestion = new IngestionService(embedder, store, this.indexer);
    this.search = new SearchService(embedder, store);
    this.context = new ContextEngine(this.search);

    if (config.databaseUrl) {
      const prisma = createPrismaClient(config.databaseUrl);
      this.memory = new MemoryService(prisma, embedder, store);
      this.knowledge = new KnowledgeService(prisma, embedder, store);
      this.documents = new DocumentService(prisma, embedder, store);
    }

    const empty = { search: async () => [] };
    this.unified = new UnifiedSearchService({
      code: this.search,
      memory: this.memory ?? empty,
      knowledge: this.knowledge ?? empty,
      documents: this.documents ?? empty,
    });
  }

  /** `true` when the project spans more than one repository. */
  get multiRepo(): boolean {
    return this.repos.length > 1;
  }

  private resolveRepo(alias?: string): RepoConfig {
    if (!alias) return this.repos[0] as RepoConfig;
    const found = this.repos.find((r) => r.alias === alias);
    if (!found) throw new Error(`Unknown repo "${alias}". Known: ${this.repoAliases().join(', ')}`);
    return found;
  }

  repoAliases(): string[] {
    return this.repos.map((r) => r.alias);
  }

  /** Build (and cache) the structural index for a repo (defaults to the first repo). */
  getIndex(alias?: string): RepositoryIndex {
    const repo = this.resolveRepo(alias);
    let index = this.indexCache.get(repo.alias);
    if (!index) {
      index = this.indexer.index(repo.root, { include: INCLUDE });
      this.indexCache.set(repo.alias, index);
    }
    return index;
  }

  /** Build (and cache) the dependency graph for a repo (defaults to the first repo). */
  getGraph(alias?: string): SymbolGraph {
    const repo = this.resolveRepo(alias);
    let graph = this.graphCache.get(repo.alias);
    if (!graph) {
      graph = SymbolGraph.fromIndex(this.getIndex(repo.alias));
      this.graphCache.set(repo.alias, graph);
    }
    return graph;
  }

  /** Structural indexes for every configured repo. */
  indexes(): Array<{ repo: string; index: RepositoryIndex }> {
    return this.repos.map((r) => ({ repo: r.alias, index: this.getIndex(r.alias) }));
  }

  /** Dependency graphs for every configured repo. */
  graphs(): Array<{ repo: string; graph: SymbolGraph }> {
    return this.repos.map((r) => ({ repo: r.alias, graph: this.getGraph(r.alias) }));
  }

  refreshIndex(): void {
    this.indexCache.clear();
    this.graphCache.clear();
  }
}
