import { getTracer } from '@brain-dock/core';
import type { RepositoryIndexer } from '@brain-dock/indexer';
import type { SymbolIndexService } from '@brain-dock/knowledge';
import type { IngestionService, IngestReport } from '@brain-dock/search';
import { DEFAULT_REPO } from '@brain-dock/search';
import { SpanStatusCode } from '@opentelemetry/api';
import type { IndexJob } from './queues';

const INCLUDE = (p: string) => !p.includes('.test.') && !p.includes('.spec.');

export interface IndexJobDeps {
  ingestion: Pick<IngestionService, 'ingestIndex'>;
  indexer: Pick<RepositoryIndexer, 'index'>;
  /** When present, the structural index (symbols/edges) is persisted to Postgres for the hosted MCP. */
  symbols?: Pick<SymbolIndexService, 'persist'>;
}

/**
 * Process a single index job: build the repo index once, upsert vectors (Qdrant) and — when a
 * symbol store is configured — persist the structural index (Postgres). Wrapped in an `index_job`
 * span. Pure of BullMQ/Redis — the testable core of the worker.
 */
export function processIndexJob(deps: IndexJobDeps, data: IndexJob): Promise<IngestReport> {
  return getTracer('brain-dock-workers').startActiveSpan('index_job', async (span) => {
    const repo = data.repo ?? DEFAULT_REPO;
    span.setAttributes({
      'brain_dock.project_id': data.projectId,
      'brain_dock.repo': repo,
      'brain_dock.collection': data.collection,
    });
    try {
      const index = deps.indexer.index(data.rootDir, { include: INCLUDE });
      const report = await deps.ingestion.ingestIndex(index, {
        projectId: data.projectId,
        collection: data.collection,
        repo: data.repo,
        repositoryId: data.repositoryId,
      });
      if (deps.symbols) {
        const persisted = await deps.symbols.persist({ projectId: data.projectId, repo }, index);
        span.setAttribute('brain_dock.symbols', persisted.symbols);
      }
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
