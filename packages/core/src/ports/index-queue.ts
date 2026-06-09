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
}

/** Producer port: enqueue an indexing job. Backed by BullMQ in production. */
export interface IndexQueue {
  enqueue(job: IndexJob): Promise<void>;
}
