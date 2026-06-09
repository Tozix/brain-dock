import { createPrismaClient } from '@brain-dock/db';
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import { type RepositoryIndex, RepositoryIndexer } from '@brain-dock/indexer';
import { KnowledgeService, MemoryService } from '@brain-dock/knowledge';
import { ContextEngine, IngestionService, SearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

export interface McpConfig {
  projectRoot: string;
  projectId: string;
  collection: string;
  qdrantUrl: string;
  ollamaUrl: string;
  embeddingModel: string;
  embedder: 'ollama' | 'deterministic';
  /** Empty disables memory/knowledge tools (they require Postgres). */
  databaseUrl: string;
}

export function loadConfig(): McpConfig {
  return {
    projectRoot: process.env.PROJECT_ROOT ?? process.cwd(),
    projectId: process.env.PROJECT_ID ?? 'default',
    collection: process.env.COLLECTION ?? 'code',
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
  private readonly indexer = new RepositoryIndexer();
  private cachedIndex: RepositoryIndex | null = null;

  constructor(readonly config: McpConfig) {
    const embedder = makeEmbedder(config);
    const store = new QdrantStore({ url: config.qdrantUrl });
    this.ingestion = new IngestionService(embedder, store, this.indexer);
    this.search = new SearchService(embedder, store);
    this.context = new ContextEngine(this.search);

    if (config.databaseUrl) {
      const prisma = createPrismaClient(config.databaseUrl);
      this.memory = new MemoryService(prisma, embedder, store);
      this.knowledge = new KnowledgeService(prisma, embedder, store);
    }
  }

  /** Build (and cache) the structural index — used by symbol/architecture tools (no Qdrant needed). */
  getIndex(): RepositoryIndex {
    if (!this.cachedIndex) {
      this.cachedIndex = this.indexer.index(this.config.projectRoot, { include: INCLUDE });
    }
    return this.cachedIndex;
  }

  refreshIndex(): RepositoryIndex {
    this.cachedIndex = null;
    return this.getIndex();
  }
}
