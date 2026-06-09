import { createEmbedder, embedderConfigFromEnv } from '@brain-dock/embedding';
import { type FileInput, RepositoryIndexer } from '@brain-dock/indexer';
import { SymbolIndexService } from '@brain-dock/knowledge';
import { CODE_COLLECTION, IngestionService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

// Match the on-disk indexer: TypeScript sources only, excluding declarations and tests.
const INDEXABLE = (p: string): boolean =>
  /\.tsx?$/.test(p) && !p.endsWith('.d.ts') && !p.includes('.test.') && !p.includes('.spec.');

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

  constructor(config: ConfigService, prisma: PrismaService) {
    const embedder = createEmbedder(embedderConfigFromEnv());
    const store = new QdrantStore({ url: config.env.QDRANT_URL });
    this.ingestion = new IngestionService(embedder, store);
    this.symbols = new SymbolIndexService(prisma.client);
    this.collection = process.env.COLLECTION ?? CODE_COLLECTION;
  }

  async indexFiles(
    projectId: string,
    repo: string,
    repositoryId: string,
    files: FileInput[],
  ): Promise<IndexUploadReport> {
    const index = this.indexer.indexFiles(
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
}
