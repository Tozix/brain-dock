import { watch } from 'node:fs';
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
 * Watch a project directory and incrementally reindex on .ts/.tsx changes
 * (debounced; runs serialized — overlapping events coalesce into one rerun).
 */
export function startWatchReindexer(options: WatchOptions): WatchHandle {
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
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void run();
      }
    }
  };

  void run(); // initial full index

  const watcher = watch(options.rootDir, { recursive: true }, (_event, filename) => {
    if (filename && !/\.tsx?$/.test(String(filename))) return;
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
