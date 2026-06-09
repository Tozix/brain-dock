import type { EmbeddingProvider } from '@brain-dock/embedding';
import { IngestionService, type IngestReport } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Worker } from 'bullmq';
import { INDEX_QUEUE, type IndexJob } from './queues';
import { redisConnection } from './redis';

export interface IndexWorkerOptions {
  redisUrl: string;
  qdrantUrl: string;
  embedder: EmbeddingProvider;
  concurrency?: number;
}

/** BullMQ worker: consumes index jobs and runs the ingestion pipeline. */
export function createIndexWorker(options: IndexWorkerOptions): Worker<IndexJob, IngestReport> {
  const ingestion = new IngestionService(
    options.embedder,
    new QdrantStore({ url: options.qdrantUrl }),
  );

  return new Worker<IndexJob, IngestReport>(
    INDEX_QUEUE,
    (job) =>
      ingestion.ingestRepository(job.data.rootDir, {
        projectId: job.data.projectId,
        collection: job.data.collection,
        repo: job.data.repo,
        repositoryId: job.data.repositoryId,
      }),
    { connection: redisConnection(options.redisUrl), concurrency: options.concurrency ?? 2 },
  );
}
