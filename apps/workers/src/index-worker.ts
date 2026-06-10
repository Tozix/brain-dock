import type { EmbeddingProvider } from '@brain-dock/embedding';
import { RepositoryIndexer } from '@brain-dock/indexer';
import type { SymbolIndexService } from '@brain-dock/knowledge';
import { IngestionService, type IngestReport } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Worker } from 'bullmq';
import { processIndexJob } from './process-index-job';
import { INDEX_QUEUE, type IndexJob } from './queues';
import { redisConnection } from './redis';

/**
 * Default job lock: 10 minutes. ts-morph parsing inside processIndexJob is synchronous and can
 * block the event loop long enough that BullMQ misses lock renewals at the default 30s lock,
 * marking an in-progress job as stalled. A generous lock rides out the blocking parse.
 */
export const DEFAULT_LOCK_DURATION_MS = 600_000;

export interface IndexWorkerOptions {
  redisUrl: string;
  qdrantUrl: string;
  embedder: EmbeddingProvider;
  concurrency?: number;
  /** Job lock duration in ms (default {@link DEFAULT_LOCK_DURATION_MS}). */
  lockDuration?: number;
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
    lockDuration: options.lockDuration ?? DEFAULT_LOCK_DURATION_MS,
  });
}
