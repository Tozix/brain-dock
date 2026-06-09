import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ProjectsModule } from '../projects/projects.module';
import { BullIndexQueue } from './bull-index-queue';
import { INDEX_QUEUE_PORT } from './index-queue';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

@Module({
  imports: [ProjectsModule],
  controllers: [RepositoriesController],
  providers: [
    RepositoriesService,
    {
      provide: INDEX_QUEUE_PORT,
      useFactory: (config: ConfigService) => new BullIndexQueue(config.env.REDIS_URL),
      inject: [ConfigService],
    },
  ],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
