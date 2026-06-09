import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  type CreateRepositoryDto,
  createRepositorySchema,
  type UpdateRepositoryDto,
  updateRepositorySchema,
} from './repositories.dto';
import { RepositoriesService } from './repositories.service';

@Controller('projects/:projectId/repositories')
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createRepositorySchema)) dto: CreateRepositoryDto,
  ) {
    return this.repositories.create(user, projectId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.repositories.list(user, projectId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.repositories.get(user, projectId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRepositorySchema)) dto: UpdateRepositoryDto,
  ) {
    return this.repositories.update(user, projectId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.repositories.remove(user, projectId, id);
  }

  @Post(':id/reindex')
  reindex(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.repositories.reindex(user, projectId, id);
  }
}
