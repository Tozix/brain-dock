import { getTracer, runWithTraceContext } from '@brain-dock/core';
import type { RepositoryIndexer } from '@brain-dock/indexer';
import type { SymbolIndexService } from '@brain-dock/knowledge';
import type { IngestionService, IngestReport } from '@brain-dock/search';
import { DEFAULT_REPO } from '@brain-dock/search';
import { SpanStatusCode } from '@opentelemetry/api';
import type { IndexJob } from './queues';

const INCLUDE = (p: string) => !p.includes('.test.') && !p.includes('.spec.');

/** Truncate persisted index errors so a giant stack/driver message cannot bloat the row. */
const MAX_INDEX_ERROR_CHARS = 1000;

/** Indexing-lifecycle patch persisted onto the Repository row (Prisma in production). */
export interface RepositoryStatusPatch {
  indexStatus: 'INDEXING' | 'READY' | 'FAILED';
  indexError?: string | null;
  lastIndexedAt?: Date;
  indexedFileCount?: number;
  symbolCount?: number;
}

/** Minimal port for writing the lifecycle status (`Repository.indexStatus` & friends). */
export interface RepositoryStatusStore {
  updateStatus(repositoryId: string, patch: RepositoryStatusPatch): Promise<void>;
}

export interface IndexJobDeps {
  ingestion: Pick<IngestionService, 'ingestIndex'>;
  indexer: Pick<RepositoryIndexer, 'index'>;
  /** When present, the structural index (symbols/edges) is persisted to Postgres for the hosted MCP. */
  symbols?: Pick<SymbolIndexService, 'persist'>;
  /** When present (and the job carries `repositoryId`), the indexing lifecycle is persisted. */
  repositories?: RepositoryStatusStore;
}

/**
 * Process a single index job: build the repo index once, upsert vectors (Qdrant) and — when a
 * symbol store is configured — persist the structural index (Postgres). Wrapped in an `index_job`
 * span. Pure of BullMQ/Redis — the testable core of the worker.
 */
export function processIndexJob(deps: IndexJobDeps, data: IndexJob): Promise<IngestReport> {
  // Best-effort lifecycle stamps: a missing/deleted Repository row must not fail the indexing
  // itself (legacy jobs have no repositoryId at all — then this is a no-op).
  const setStatus = async (patch: RepositoryStatusPatch): Promise<void> => {
    if (!deps.repositories || !data.repositoryId) return;
    try {
      await deps.repositories.updateStatus(data.repositoryId, patch);
    } catch (error) {
      console.error(
        `[index] failed to persist indexStatus=${patch.indexStatus} for ${data.repositoryId}:`,
        error,
      );
    }
  };

  // Continue the trace started at the API (reindex request) when a carrier was propagated.
  return runWithTraceContext(data.trace, () =>
    getTracer('brain-dock-workers').startActiveSpan('index_job', async (span) => {
      const repo = data.repo ?? DEFAULT_REPO;
      span.setAttributes({
        'brain_dock.project_id': data.projectId,
        'brain_dock.repo': repo,
        'brain_dock.collection': data.collection,
      });
      try {
        await setStatus({ indexStatus: 'INDEXING' });
        const index = deps.indexer.index(data.rootDir, { include: INCLUDE });
        const report = await deps.ingestion.ingestIndex(index, {
          projectId: data.projectId,
          collection: data.collection,
          repo: data.repo,
          repositoryId: data.repositoryId,
        });
        if (deps.symbols) {
          try {
            const persisted = await deps.symbols.persist(
              { projectId: data.projectId, repo },
              index,
            );
            span.setAttribute('brain_dock.symbols', persisted.symbols);
          } catch (error) {
            // Vectors and symbols are written in separate stores with no shared transaction;
            // surface the mixed state explicitly before letting the queue retry the job.
            console.error(
              '[index] vectors updated but symbol persist failed — job will retry; symbols stale until then',
              error,
            );
            throw error;
          }
        }
        span.setAttributes({
          'brain_dock.files': report.files,
          'brain_dock.chunks': report.chunks,
        });
        await setStatus({
          indexStatus: 'READY',
          indexError: null,
          lastIndexedAt: new Date(),
          indexedFileCount: report.files,
          symbolCount: index.stats.symbols,
        });
        return report;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await setStatus({
          indexStatus: 'FAILED',
          indexError: message.slice(0, MAX_INDEX_ERROR_CHARS),
        });
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    }),
  );
}
