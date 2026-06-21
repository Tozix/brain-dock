/** Index queue contract — shared by the API (producer) and workers (consumer). */
export const INDEX_QUEUE = 'brain-dock-index';

export interface IndexJob {
  projectId: string;
  rootDir: string;
  collection: string;
  /** Repository alias within the project (defaults to the ingestion default). */
  repo?: string;
  /** Stable repository id (uuid) — written into vector payloads for isolation. */
  repositoryId?: string;
  /**
   * `upload` = `rootDir` is a throwaway staging directory the API wrote uploaded files into;
   * the worker indexes it then **deletes** it (and the producer disables retries, since the
   * bytes only existed for that one request). Absent/`reindex` = a persistent server-side path.
   */
  kind?: 'reindex' | 'upload';
  /** W3C trace-context carrier for api→worker trace propagation (set by the producer). */
  trace?: Record<string, string>;
}

/** Producer port: enqueue an indexing job. Backed by BullMQ in production. */
export interface IndexQueue {
  enqueue(job: IndexJob): Promise<void>;
}
