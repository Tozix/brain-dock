import { CODE_COLLECTION } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';
import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { VectorCleanupService } from './vector-cleanup.service';

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    {
      provide: VectorCleanupService,
      useFactory: (config: ConfigService) =>
        new VectorCleanupService(new QdrantStore({ url: config.env.QDRANT_URL }), [
          process.env.COLLECTION ?? CODE_COLLECTION,
          'memory',
          'knowledge',
          'documents',
        ]),
      inject: [ConfigService],
    },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
