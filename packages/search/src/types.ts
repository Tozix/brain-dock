/** Payload stored with each vector point in Qdrant. */
export interface ChunkPayload {
  /** Index signature lets the payload satisfy Qdrant's Record<string, unknown> shape. */
  [key: string]: unknown;
  projectId: string;
  /** Repository alias within the project — enables multi-repo isolation/filtering. */
  repo: string;
  /** Stable repository id (uuid) when the repo is DB-managed; absent for env-configured repos. */
  repositoryId?: string;
  path: string;
  symbol: string;
  kind: string;
  /** NestJS/architectural role from the indexer (controller/service/...). */
  role: string;
  startLine: number;
  endLine: number;
  /** Embedding model id — enables detecting stale vectors on model change. */
  model: string;
  text: string;
}

export interface SearchResult extends ChunkPayload {
  score: number;
}

export const CODE_COLLECTION = 'code';

/** Repository alias used when a project has a single (unnamed) repository. */
export const DEFAULT_REPO = 'default';
