import type { KnowledgeItem, PrismaClient } from '@brain-dock/db';
import type { EmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantStore } from '@brain-dock/storage';
import { EmbeddedIndex } from './embedded-index';
import type { SaveKnowledgeInput } from './schemas';

export interface KnowledgeHit {
  score: number;
  item: KnowledgeItem;
}

/** Project knowledge base: business rules, architecture, requirements, ADR, FAQ, … */
export class KnowledgeService {
  private readonly index: EmbeddedIndex;

  constructor(
    private readonly prisma: PrismaClient,
    embedder: EmbeddingProvider,
    store: QdrantStore,
  ) {
    this.index = new EmbeddedIndex(embedder, store, 'knowledge');
  }

  async save(input: SaveKnowledgeInput): Promise<KnowledgeItem> {
    const item = await this.prisma.knowledgeItem.create({
      data: {
        projectId: input.projectId,
        type: input.type ?? 'NOTE',
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
      },
    });
    try {
      await this.index.upsert(item.id, `${item.title}\n\n${item.content}`, {
        projectId: item.projectId,
        type: item.type,
        title: item.title,
      });
    } catch (error) {
      // Compensate the failed vector write: drop the orphaned row so the two stores stay in sync.
      await this.prisma.knowledgeItem.deleteMany({ where: { id: item.id } }).catch(() => {});
      throw error;
    }
    return item;
  }

  async search(projectId: string, query: string, limit = 10): Promise<KnowledgeHit[]> {
    const hits = await this.index.search(query, projectId, limit);
    if (hits.length === 0) return [];
    const items = await this.prisma.knowledgeItem.findMany({
      where: { id: { in: hits.map((h) => String(h.id)) } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const out: KnowledgeHit[] = [];
    for (const hit of hits) {
      const item = byId.get(String(hit.id));
      if (item) out.push({ score: hit.score, item });
    }
    return out;
  }

  async update(
    projectId: string,
    id: string,
    patch: {
      title?: string;
      content?: string;
      type?: SaveKnowledgeInput['type'];
      tags?: string[];
    },
  ): Promise<KnowledgeItem | null> {
    const updated = await this.prisma.knowledgeItem.updateMany({
      where: { id, projectId },
      data: { title: patch.title, content: patch.content, type: patch.type, tags: patch.tags },
    });
    if (updated.count === 0) return null;
    const item = await this.prisma.knowledgeItem.findUnique({ where: { id } });
    if (item) {
      try {
        await this.index.upsert(item.id, `${item.title}\n\n${item.content}`, {
          projectId: item.projectId,
          type: item.type,
          title: item.title,
        });
      } catch (error) {
        // The row is already updated — surface that search results may lag behind.
        throw new Error(
          `knowledge updated but vector index may be stale: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    return item;
  }

  async delete(projectId: string, id: string): Promise<boolean> {
    const deleted = await this.prisma.knowledgeItem.deleteMany({ where: { id, projectId } });
    if (deleted.count > 0) await this.index.delete(id);
    return deleted.count > 0;
  }

  async list(projectId: string, page?: { take?: number; skip?: number }): Promise<KnowledgeItem[]> {
    return await this.prisma.knowledgeItem.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: page?.take,
      skip: page?.skip,
    });
  }
}
