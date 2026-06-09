import { createPrismaClient, type PrismaClient } from '@brain-dock/db';
import { createEmbedder, embedderConfigFromEnv } from '@brain-dock/embedding';
import {
  DocumentService,
  KnowledgeService,
  MemoryService,
  SymbolIndexService,
} from '@brain-dock/knowledge';
import { ContextEngine, SearchService, UnifiedSearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

/** Shared, process-wide services for the remote MCP. projectId is supplied per request (not here). */
export interface RemoteServices {
  prisma: PrismaClient;
  search: SearchService;
  context: ContextEngine;
  unified: UnifiedSearchService;
  memory: MemoryService;
  knowledge: KnowledgeService;
  documents: DocumentService;
  symbols: SymbolIndexService;
  collection: string;
}

export interface RemoteConfig {
  databaseUrl: string;
  qdrantUrl: string;
  collection: string;
  embedder: 'ollama' | 'deterministic';
  ollamaUrl: string;
  embeddingModel: string;
}

export function loadRemoteConfig(): RemoteConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:16333',
    collection: process.env.COLLECTION ?? 'code',
    embedder: process.env.EMBEDDER === 'ollama' ? 'ollama' : 'deterministic',
    ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    embeddingModel: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
  };
}

/** Build the shared services once. All read/write scope by the projectId passed at call time. */
export function buildRemoteServices(config: RemoteConfig): RemoteServices {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required for the remote MCP');
  const embedder = createEmbedder(embedderConfigFromEnv());
  const store = new QdrantStore({ url: config.qdrantUrl });
  const prisma = createPrismaClient(config.databaseUrl);
  const search = new SearchService(embedder, store);
  const memory = new MemoryService(prisma, embedder, store);
  const knowledge = new KnowledgeService(prisma, embedder, store);
  const documents = new DocumentService(prisma, embedder, store);
  return {
    prisma,
    search,
    context: new ContextEngine(search),
    unified: new UnifiedSearchService({ code: search, memory, knowledge, documents }),
    memory,
    knowledge,
    documents,
    symbols: new SymbolIndexService(prisma),
    collection: config.collection,
  };
}
