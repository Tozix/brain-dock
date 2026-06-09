import { getTracer } from '@brain-dock/core';
import type { IngestionService, IngestReport } from '@brain-dock/search';
import { SpanStatusCode } from '@opentelemetry/api';
import type { IndexJob } from './queues';

type Ingestor = Pick<IngestionService, 'ingestRepository'>;

/**
 * Process a single index job: wrap ingestion in an `index_job` span (no-op when tracing is off),
 * forwarding repo/repositoryId. Pure of BullMQ/Redis — the testable core of the worker.
 */
export function processIndexJob(ingestion: Ingestor, data: IndexJob): Promise<IngestReport> {
  return getTracer('brain-dock-workers').startActiveSpan('index_job', async (span) => {
    span.setAttributes({
      'brain_dock.project_id': data.projectId,
      'brain_dock.repo': data.repo ?? 'default',
      'brain_dock.collection': data.collection,
    });
    try {
      const report = await ingestion.ingestRepository(data.rootDir, {
        projectId: data.projectId,
        collection: data.collection,
        repo: data.repo,
        repositoryId: data.repositoryId,
      });
      span.setAttributes({ 'brain_dock.files': report.files, 'brain_dock.chunks': report.chunks });
      return report;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}
