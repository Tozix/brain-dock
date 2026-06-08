import type { EmbeddingProvider } from '@brain-dock/embedding';
import { type RepositoryIndex, RepositoryIndexer } from '@brain-dock/indexer';
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

/** Pipeline: index a repo → embed each chunk → upsert into Qdrant. */
export class IngestionService {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: QdrantStore,
    private readonly indexer: RepositoryIndexer = new RepositoryIndexer(),
  ) {}

  async ingestRepository(rootDir: string, options: IngestOptions): Promise<IngestReport> {
    const index = this.indexer.index(rootDir, {
      include: (p) => !p.includes('.test.') && !p.includes('.spec.'),
    });
    return this.ingestIndex(index, options);
  }

  async ingestIndex(index: RepositoryIndex, options: IngestOptions): Promise<IngestReport> {
    await this.store.ensureCollection(options.collection, this.embedder.dimensions);

    const records = index.files.flatMap((file) => {
      const roleByKey = new Map(file.symbols.map((s) => [`${s.name}:${s.startLine}`, s.nestRole]));
      return file.chunks.map((chunk) => ({
        chunk,
        path: file.path,
        role: roleByKey.get(`${chunk.symbol}:${chunk.startLine}`) ?? 'none',
      }));
    });

    if (records.length === 0) return { files: index.files.length, chunks: 0 };

    const vectors = await this.embedder.embed(records.map((r) => r.chunk.text));

    const points: VectorPoint[] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const vector = vectors[i];
      if (!record || !vector) continue;
      const payload: ChunkPayload = {
        projectId: options.projectId,
        path: record.path,
        symbol: record.chunk.symbol,
        kind: record.chunk.kind,
        role: record.role,
        startLine: record.chunk.startLine,
        endLine: record.chunk.endLine,
        model: this.embedder.model,
        text: record.chunk.text.slice(0, 4000),
      };
      points.push({ id: uuidFromHash(record.chunk.id), vector, payload });
    }

    await this.store.upsert(options.collection, points);
    return { files: index.files.length, chunks: points.length };
  }
}
