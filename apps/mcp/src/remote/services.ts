import type { IndexQueue } from '@brain-dock/core';
import { createPrismaClient, type PrismaClient } from '@brain-dock/db';
import { createEmbedder } from '@brain-dock/embedding';
import {
  DocumentService,
  KnowledgeService,
  MemoryService,
  SymbolIndexService,
  UsageService,
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
  usage: UsageService;
  collection: string;
  /**
   * Optional index-job producer for the `trigger_reindex` tool. Not wired by
   * {@link buildRemoteServices}: BullMQ pulls a native addon that crashes under Bun without
   * `--no-addons`, and this process runs without that flag — hosted deployments index via the
   * upload path instead. When absent, `trigger_reindex` explains that and points at the upload
   * path; tests (or a future entrypoint) can inject an {@link IndexQueue} here.
   */
  queue?: IndexQueue;
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
  const embedder = createEmbedder({
    provider: config.embedder,
    ollamaUrl: config.ollamaUrl,
    model: config.embeddingModel,
  });
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
    usage: new UsageService(prisma),
    collection: config.collection,
  };
}
