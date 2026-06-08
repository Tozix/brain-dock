/** Queue names and job payloads shared by producers and workers. */
export const INDEX_QUEUE = 'brain-dock-index';

export interface IndexJob {
  projectId: string;
  rootDir: string;
  collection: string;
}
