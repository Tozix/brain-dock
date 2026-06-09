import type { MemoryItem, PrismaClient } from '@brain-dock/db';
import type { EmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantStore } from '@brain-dock/storage';
import { EmbeddedIndex } from './embedded-index';
import type { RememberInput } from './schemas';

export interface MemoryHit {
  score: number;
  item: MemoryItem;
}

/** Long-term project memory: decisions, facts, notes, TODOs. */
export class MemoryService {
  private readonly index: EmbeddedIndex;

  constructor(
    private readonly prisma: PrismaClient,
    embedder: EmbeddingProvider,
    store: QdrantStore,
  ) {
    this.index = new EmbeddedIndex(embedder, store, 'memory');
  }

  async remember(input: RememberInput): Promise<MemoryItem> {
    const item = await this.prisma.memoryItem.create({
      data: {
        projectId: input.projectId,
        type: input.type ?? 'NOTE',
        content: input.content,
        tags: input.tags ?? [],
      },
    });
    await this.index.upsert(item.id, item.content, {
      projectId: item.projectId,
      type: item.type,
    });
    return item;
  }

  async search(projectId: string, query: string, limit = 10): Promise<MemoryHit[]> {
    const hits = await this.index.search(query, projectId, limit);
    if (hits.length === 0) return [];
    const items = await this.prisma.memoryItem.findMany({
      where: { id: { in: hits.map((h) => String(h.id)) } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const out: MemoryHit[] = [];
    for (const hit of hits) {
      const item = byId.get(String(hit.id));
      if (item) out.push({ score: hit.score, item });
    }
    return out;
  }

  async list(projectId: string): Promise<MemoryItem[]> {
    return await this.prisma.memoryItem.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
