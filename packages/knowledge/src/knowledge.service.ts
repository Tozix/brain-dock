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
    await this.index.upsert(item.id, `${item.title}\n\n${item.content}`, {
      projectId: item.projectId,
      type: item.type,
      title: item.title,
    });
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

  async list(projectId: string): Promise<KnowledgeItem[]> {
    return await this.prisma.knowledgeItem.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
