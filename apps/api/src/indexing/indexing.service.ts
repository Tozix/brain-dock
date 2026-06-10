import { createEmbedder, embedderConfigFromEnv } from '@brain-dock/embedding';
import { type FileIndex, type FileInput, RepositoryIndexer } from '@brain-dock/indexer';
import { SymbolIndexService } from '@brain-dock/knowledge';
import { CODE_COLLECTION, IngestionService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

// Match the on-disk indexer: TypeScript sources only, excluding declarations and tests.
const INDEXABLE = (p: string): boolean =>
  /\.tsx?$/.test(p) && !p.endsWith('.d.ts') && !p.includes('.test.') && !p.includes('.spec.');

// Parse this many files between yields to the event loop (ts-morph parsing is synchronous).
const PARSE_BATCH_SIZE = 25;

export interface IndexUploadReport {
  files: number;
  chunks: number;
  symbols: number;
}

/**
 * Index files uploaded by a client (no server-side path / git needed): parse in memory, embed to
 * Qdrant and persist the structural index to Postgres — the same outputs as the worker, on demand.
 */
@Injectable()
export class IndexingService {
  private readonly indexer = new RepositoryIndexer();
  private readonly ingestion: IngestionService;
  private readonly symbols: SymbolIndexService;
  private readonly collection: string;
  private readonly maxTotalBytes: number;

  constructor(config: ConfigService, prisma: PrismaService) {
    const embedder = createEmbedder(embedderConfigFromEnv());
    const store = new QdrantStore({ url: config.env.QDRANT_URL });
    this.ingestion = new IngestionService(embedder, store);
    this.symbols = new SymbolIndexService(prisma.client);
    this.collection = process.env.COLLECTION ?? CODE_COLLECTION;
    this.maxTotalBytes = config.env.INDEX_UPLOAD_MAX_TOTAL_BYTES;
  }

  async indexFiles(
    projectId: string,
    repo: string,
    repositoryId: string,
    files: FileInput[],
  ): Promise<IndexUploadReport> {
    // Total upload budget — a request-level backstop on top of the per-file schema limits.
    const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf8'), 0);
    if (totalBytes > this.maxTotalBytes) {
      throw new PayloadTooLargeException(
        `upload of ${totalBytes} bytes exceeds INDEX_UPLOAD_MAX_TOTAL_BYTES (${this.maxTotalBytes})`,
      );
    }

    const index = await this.parseInBatches(
      repo,
      files.filter((f) => INDEXABLE(f.path)),
    );
    const report = await this.ingestion.ingestIndex(index, {
      projectId,
      collection: this.collection,
      repo,
      repositoryId,
    });
    const persisted = await this.symbols.persist({ projectId, repo }, index);
    return { files: report.files, chunks: report.chunks, symbols: persisted.symbols };
  }

  /**
   * ts-morph parsing is synchronous and CPU-bound; parse in batches and yield to the event loop
   * between them so one big upload cannot starve other requests for seconds.
   */
  private async parseInBatches(repo: string, inputs: FileInput[]) {
    const files: FileIndex[] = [];
    for (let i = 0; i < inputs.length; i += PARSE_BATCH_SIZE) {
      const batch = inputs.slice(i, i + PARSE_BATCH_SIZE);
      files.push(...this.indexer.indexFiles(repo, batch).files);
      if (i + PARSE_BATCH_SIZE < inputs.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    return {
      rootDir: repo,
      files,
      stats: {
        files: files.length,
        symbols: files.reduce((n, f) => n + f.symbols.length, 0),
        chunks: files.reduce((n, f) => n + f.chunks.length, 0),
        relations: files.reduce((n, f) => n + f.relations.length, 0),
      },
    };
  }
}
