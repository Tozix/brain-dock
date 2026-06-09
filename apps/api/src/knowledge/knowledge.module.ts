import { DocumentService, KnowledgeService, MemoryService } from '@brain-dock/knowledge';
import { SearchService, UnifiedSearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsModule } from '../projects/projects.module';
import { DocumentsController } from './documents.controller';
import { makeEmbedder } from './embedder.factory';
import { KnowledgeController } from './knowledge.controller';
import { MemoryController } from './memory.controller';
import { SearchController } from './search.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [MemoryController, KnowledgeController, DocumentsController, SearchController],
  providers: [
    {
      provide: SearchService,
      useFactory: (config: ConfigService) =>
        new SearchService(
          makeEmbedder(config.env),
          new QdrantStore({ url: config.env.QDRANT_URL }),
        ),
      inject: [ConfigService],
    },
    {
      provide: UnifiedSearchService,
      useFactory: (
        code: SearchService,
        memory: MemoryService,
        knowledge: KnowledgeService,
        documents: DocumentService,
      ) => new UnifiedSearchService({ code, memory, knowledge, documents }),
      inject: [SearchService, MemoryService, KnowledgeService, DocumentService],
    },
    {
      provide: DocumentService,
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        new DocumentService(
          prisma.client,
          makeEmbedder(config.env),
          new QdrantStore({ url: config.env.QDRANT_URL }),
        ),
      inject: [ConfigService, PrismaService],
    },
    {
      provide: MemoryService,
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        new MemoryService(
          prisma.client,
          makeEmbedder(config.env),
          new QdrantStore({ url: config.env.QDRANT_URL }),
        ),
      inject: [ConfigService, PrismaService],
    },
    {
      provide: KnowledgeService,
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        new KnowledgeService(
          prisma.client,
          makeEmbedder(config.env),
          new QdrantStore({ url: config.env.QDRANT_URL }),
        ),
      inject: [ConfigService, PrismaService],
    },
  ],
})
export class KnowledgeApiModule {}
