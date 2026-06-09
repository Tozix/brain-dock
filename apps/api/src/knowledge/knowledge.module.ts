import { KnowledgeService, MemoryService } from '@brain-dock/knowledge';
import { QdrantStore } from '@brain-dock/storage';
import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsModule } from '../projects/projects.module';
import { makeEmbedder } from './embedder.factory';
import { KnowledgeController } from './knowledge.controller';
import { MemoryController } from './memory.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [MemoryController, KnowledgeController],
  providers: [
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
