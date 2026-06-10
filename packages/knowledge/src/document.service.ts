import { createHash } from 'node:crypto';
import type { Document, PrismaClient } from '@brain-dock/db';
import type { EmbeddingProvider } from '@brain-dock/embedding';
import { QdrantStore, uuidFromHash, type VectorPoint } from '@brain-dock/storage';
import { chunkText } from './chunker';
import { extractText } from './parsers';
import type { SaveDocumentInput, UpdateDocumentInput } from './schemas';

const COLLECTION = 'documents';

export interface DocumentHit {
  score: number;
  document: Document;
  chunkIndex: number;
}

interface ChunkPayloadShape {
  documentId?: string;
  chunkIndex?: number;
}

function pointId(documentId: string, index: number): string {
  return uuidFromHash(createHash('sha256').update(`${documentId}:${index}`).digest('hex'));
}

/** Documents: stored in Postgres, chunked + embedded into Qdrant for semantic search. */
export class DocumentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly embedder: EmbeddingProvider,
    private readonly store: QdrantStore,
  ) {}

  async ingest(input: SaveDocumentInput): Promise<{ document: Document; chunks: number }> {
    const text = await extractText(input.format, input.content);
    const document = await this.prisma.document.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        format: input.format,
        source: input.source ?? null,
        content: text,
      },
    });

    try {
      const chunks = await this.embedDocument(document, text);
      return { document, chunks };
    } catch (error) {
      // Compensate the failed vector write: drop the orphaned row so the two stores stay in sync.
      await this.prisma.document.deleteMany({ where: { id: document.id } }).catch(() => {});
      throw error;
    }
  }

  /** Chunk + embed a document's text into Qdrant. Returns the number of chunks written. */
  private async embedDocument(document: Document, text: string): Promise<number> {
    const chunks = chunkText(text);
    if (chunks.length === 0) return 0;
    await this.store.ensureCollection(COLLECTION, this.embedder.dimensions);
    const vectors = await this.embedder.embed(chunks);
    const points: VectorPoint[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = vectors[i];
      if (!vector) continue;
      points.push({
        id: pointId(document.id, i),
        vector,
        payload: {
          projectId: document.projectId,
          documentId: document.id,
          title: document.title,
          chunkIndex: i,
        },
      });
    }
    await this.store.upsert(COLLECTION, points);
    return chunks.length;
  }

  private async dropVectors(documentId: string): Promise<void> {
    try {
      await this.store.deleteByFilter(COLLECTION, {
        must: [{ key: 'documentId', match: { value: documentId } }],
      });
    } catch {
      // collection may not exist — nothing to clean up
    }
  }

  async search(projectId: string, query: string, limit = 10): Promise<DocumentHit[]> {
    const vector = await this.embedder.embedQuery(query);
    if (vector.length === 0) return [];

    const hits = await this.store.search(COLLECTION, vector, {
      limit: limit * 3,
      filter: { must: [{ key: 'projectId', match: { value: projectId } }] },
    });

    // Keep the best-scoring chunk per document.
    const bestByDoc = new Map<string, { score: number; chunkIndex: number }>();
    for (const hit of hits) {
      const payload = hit.payload as ChunkPayloadShape;
      const documentId = payload.documentId;
      if (!documentId) continue;
      const prev = bestByDoc.get(documentId);
      if (!prev || hit.score > prev.score) {
        bestByDoc.set(documentId, { score: hit.score, chunkIndex: payload.chunkIndex ?? 0 });
      }
    }
    if (bestByDoc.size === 0) return [];

    const documents = await this.prisma.document.findMany({
      where: { id: { in: [...bestByDoc.keys()] } },
    });
    const byId = new Map(documents.map((d) => [d.id, d]));

    const out: DocumentHit[] = [];
    for (const [documentId, info] of bestByDoc) {
      const document = byId.get(documentId);
      if (document) out.push({ score: info.score, document, chunkIndex: info.chunkIndex });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Update a document. Title/source changes touch Postgres only; when `content` is provided the
   * text is re-extracted (using `format` or the stored one), old vectors are dropped and the new
   * chunks re-embedded. Returns null when the document does not exist in the project.
   */
  async update(
    projectId: string,
    id: string,
    patch: UpdateDocumentInput,
  ): Promise<{ document: Document; chunks: number } | null> {
    const existing = await this.prisma.document.findFirst({ where: { id, projectId } });
    if (existing) {
      const contentChanged = patch.content !== undefined;
      const format = patch.format ?? existing.format;
      const text = contentChanged
        ? await extractText(format, patch.content as string)
        : existing.content;

      const document = await this.prisma.document.update({
        where: { id },
        data: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.format !== undefined ? { format: patch.format } : {}),
          ...(patch.source !== undefined ? { source: patch.source } : {}),
          ...(contentChanged ? { content: text } : {}),
        },
      });

      if (contentChanged) {
        await this.dropVectors(id);
        try {
          const chunks = await this.embedDocument(document, text);
          return { document, chunks };
        } catch (error) {
          // The row is already updated — surface that search results may lag behind.
          throw new Error(
            `document updated but vector index may be stale: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
      return { document, chunks: chunkText(text).length };
    }
    return null;
  }

  async delete(projectId: string, id: string): Promise<boolean> {
    const deleted = await this.prisma.document.deleteMany({ where: { id, projectId } });
    if (deleted.count > 0) await this.dropVectors(id);
    return deleted.count > 0;
  }

  async list(projectId: string, page?: { take?: number; skip?: number }): Promise<Document[]> {
    return await this.prisma.document.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: page?.take,
      skip: page?.skip,
    });
  }
}
