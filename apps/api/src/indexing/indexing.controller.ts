import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RepositoriesService } from '../repositories/repositories.service';
import { type IndexFilesDto, indexFilesSchema } from './indexing.dto';
import { IndexingService } from './indexing.service';

/** Upload-and-index: clients (e.g. the VSCode extension) push file contents to be indexed. */
@Controller('projects/:projectId/repositories/:id/index')
export class IndexingController {
  constructor(
    private readonly repositories: RepositoriesService,
    private readonly indexing: IndexingService,
  ) {}

  @Post()
  async index(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(indexFilesSchema)) dto: IndexFilesDto,
  ) {
    const repo = await this.repositories.get(user, projectId, id);
    return this.indexing.indexFiles(repo.projectId, repo.alias, repo.id, dto.files);
  }
}
