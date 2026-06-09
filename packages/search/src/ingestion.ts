import type { EmbeddingProvider } from '@brain-dock/embedding';
import { type FileIndex, type RepositoryIndex, RepositoryIndexer } from '@brain-dock/indexer';
import { QdrantStore, uuidFromHash, type VectorPoint } from '@brain-dock/storage';
import type { ChunkPayload } from './types';

export interface IngestOptions {
  projectId: string;
  collection: string;
}

export interface IngestReport {
  files: number;
  chunks: number;
}

export interface IncrementalReport extends IngestReport {
  changedFiles: number;
  removedFiles: number;
  /** Pass this back as `previous` for the next incremental run. */
  index: RepositoryIndex;
}

const INCLUDE = (p: string) => !p.includes('.test.') && !p.includes('.spec.');

/** Pipeline: index a repo → embed each chunk → upsert into Qdrant. */
export class IngestionService {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: QdrantStore,
    private readonly indexer: RepositoryIndexer = new RepositoryIndexer(),
  ) {}

  async ingestRepository(rootDir: string, options: IngestOptions): Promise<IngestReport> {
    return this.ingestIndex(this.indexer.index(rootDir, { include: INCLUDE }), options);
  }

  async ingestIndex(index: RepositoryIndex, options: IngestOptions): Promise<IngestReport> {
    await this.store.ensureCollection(options.collection, this.embedder.dimensions);
    let chunks = 0;
    for (const file of index.files) {
      const points = await this.embedFile(file, options.projectId);
      if (points.length > 0) {
        await this.store.upsert(options.collection, points);
        chunks += points.length;
      }
    }
    return { files: index.files.length, chunks };
  }

  /** Re-index only files whose content hash changed; drop vectors of changed/removed files. */
  async ingestIncremental(
    rootDir: string,
    options: IngestOptions & { previous?: RepositoryIndex },
  ): Promise<IncrementalReport> {
    const index = this.indexer.index(rootDir, { previous: options.previous, include: INCLUDE });
    await this.store.ensureCollection(options.collection, this.embedder.dimensions);

    const previousByPath = new Map((options.previous?.files ?? []).map((f) => [f.path, f]));
    const currentPaths = new Set(index.files.map((f) => f.path));

    let changedFiles = 0;
    let chunks = 0;
    for (const file of index.files) {
      const previous = previousByPath.get(file.path);
      if (previous && previous.hash === file.hash) continue; // unchanged — reuse vectors
      changedFiles++;
      await this.deletePath(options.collection, file.path);
      const points = await this.embedFile(file, options.projectId);
      if (points.length > 0) {
        await this.store.upsert(options.collection, points);
        chunks += points.length;
      }
    }

    let removedFiles = 0;
    for (const path of previousByPath.keys()) {
      if (!currentPaths.has(path)) {
        removedFiles++;
        await this.deletePath(options.collection, path);
      }
    }

    return { files: index.files.length, changedFiles, removedFiles, chunks, index };
  }

  private async embedFile(file: FileIndex, projectId: string): Promise<VectorPoint[]> {
    if (file.chunks.length === 0) return [];
    const roleByKey = new Map(file.symbols.map((s) => [`${s.name}:${s.startLine}`, s.nestRole]));
    const vectors = await this.embedder.embed(file.chunks.map((c) => c.text));

    const points: VectorPoint[] = [];
    for (let i = 0; i < file.chunks.length; i++) {
      const chunk = file.chunks[i];
      const vector = vectors[i];
      if (!chunk || !vector) continue;
      const payload: ChunkPayload = {
        projectId,
        path: file.path,
        symbol: chunk.symbol,
        kind: chunk.kind,
        role: roleByKey.get(`${chunk.symbol}:${chunk.startLine}`) ?? 'none',
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        model: this.embedder.model,
        text: chunk.text.slice(0, 4000),
      };
      points.push({ id: uuidFromHash(chunk.id), vector, payload });
    }
    return points;
  }

  private async deletePath(collection: string, path: string): Promise<void> {
    try {
      await this.store.deleteByFilter(collection, {
        must: [{ key: 'path', match: { value: path } }],
      });
    } catch {
      // collection may be empty / missing — nothing to delete
    }
  }
}
