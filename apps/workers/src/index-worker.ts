import type { EmbeddingProvider } from '@brain-dock/embedding';
import { RepositoryIndexer } from '@brain-dock/indexer';
import type { SymbolIndexService } from '@brain-dock/knowledge';
import { IngestionService, type IngestReport } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Worker } from 'bullmq';
import { processIndexJob } from './process-index-job';
import { INDEX_QUEUE, type IndexJob } from './queues';
import { redisConnection } from './redis';

export interface IndexWorkerOptions {
  redisUrl: string;
  qdrantUrl: string;
  embedder: EmbeddingProvider;
  concurrency?: number;
  /** When present, the worker also persists the structural index to Postgres (hosted MCP). */
  symbols?: SymbolIndexService;
}

/** BullMQ worker: consumes index jobs and runs the ingestion pipeline. */
export function createIndexWorker(options: IndexWorkerOptions): Worker<IndexJob, IngestReport> {
  const ingestion = new IngestionService(
    options.embedder,
    new QdrantStore({ url: options.qdrantUrl }),
  );
  const deps = { ingestion, indexer: new RepositoryIndexer(), symbols: options.symbols };
  return new Worker<IndexJob, IngestReport>(INDEX_QUEUE, (job) => processIndexJob(deps, job.data), {
    connection: redisConnection(options.redisUrl),
    concurrency: options.concurrency ?? 2,
  });
}
