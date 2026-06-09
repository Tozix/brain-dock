import { getTracer } from '@brain-dock/core';
import type { EmbeddingProvider } from '@brain-dock/embedding';
import { IngestionService, type IngestReport } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { SpanStatusCode } from '@opentelemetry/api';
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

  const tracer = getTracer('brain-dock-workers');

  return new Worker<IndexJob, IngestReport>(
    INDEX_QUEUE,
    (job) =>
      // One span per index job (no-op when tracing is disabled).
      tracer.startActiveSpan('index_job', async (span) => {
        span.setAttributes({
          'brain_dock.project_id': job.data.projectId,
          'brain_dock.repo': job.data.repo ?? 'default',
          'brain_dock.collection': job.data.collection,
        });
        try {
          const report = await ingestion.ingestRepository(job.data.rootDir, {
            projectId: job.data.projectId,
            collection: job.data.collection,
            repo: job.data.repo,
            repositoryId: job.data.repositoryId,
          });
          span.setAttributes({
            'brain_dock.files': report.files,
            'brain_dock.chunks': report.chunks,
          });
          return report;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
          throw error;
        } finally {
          span.end();
        }
      }),
    { connection: redisConnection(options.redisUrl), concurrency: options.concurrency ?? 2 },
  );
}
