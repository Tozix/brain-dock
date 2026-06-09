import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { IndexingController } from './indexing.controller';
import { IndexingService } from './indexing.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [IndexingController],
  providers: [IndexingService],
})
export class IndexingModule {}
