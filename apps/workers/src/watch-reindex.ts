import { existsSync, type WatchEventType, watch } from 'node:fs';
import type { EmbeddingProvider } from '@brain-dock/embedding';
import type { RepositoryIndex } from '@brain-dock/indexer';
import { type IncrementalReport, IngestionService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

export interface WatchOptions {
  rootDir: string;
  projectId: string;
  collection: string;
  /** Repository alias within the project (multi-repo isolation/filtering). */
  repo?: string;
  /** Stable repository id (uuid) when the repo is DB-managed. */
  repositoryId?: string;
  embedder: EmbeddingProvider;
  qdrantUrl: string;
  debounceMs?: number;
  onReindex?: (report: IncrementalReport) => void;
}

export interface WatchHandle {
  stop(): void;
}

/**
 * Whether an fs.watch event should schedule a reindex pass. `rename` events (create/delete,
 * including whole directories) carry no reliable extension — a deleted directory has none —
 * so they always schedule; only `change` events are filtered to .ts/.tsx sources.
 */
export function shouldScheduleReindex(event: WatchEventType, filename: string | null): boolean {
  if (event !== 'change') return true;
  return !filename || /\.tsx?$/.test(filename);
}

/**
 * Watch a project directory and incrementally reindex on .ts/.tsx changes
 * (debounced; runs serialized — overlapping events coalesce into one rerun).
 * Throws if the root does not exist (callers watching many repos should catch and skip).
 */
export function startWatchReindexer(options: WatchOptions): WatchHandle {
  if (!existsSync(options.rootDir)) {
    throw new Error(`watch root does not exist: ${options.rootDir}`);
  }
  const ingestion = new IngestionService(
    options.embedder,
    new QdrantStore({ url: options.qdrantUrl }),
  );
  let previous: RepositoryIndex | undefined;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const report = await ingestion.ingestIncremental(options.rootDir, {
        projectId: options.projectId,
        collection: options.collection,
        repo: options.repo,
        repositoryId: options.repositoryId,
        previous,
      });
      previous = report.index;
      options.onReindex?.(report);
    } catch (error) {
      // Keep the watcher alive: log the failed pass; the next FS event schedules a retry.
      console.error(`[watch] reindex failed for ${options.rootDir}:`, error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void run();
      }
    }
  };

  void run(); // initial full index

  const watcher = watch(options.rootDir, { recursive: true }, (event, filename) => {
    if (!shouldScheduleReindex(event, filename)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), options.debounceMs ?? 400);
  });

  return {
    stop() {
      watcher.close();
      if (timer) clearTimeout(timer);
    },
  };
}
