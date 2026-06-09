import { UnifiedSearchService } from '@brain-dock/search';
import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ProjectsService } from '../projects/projects.service';

/** Unified search across code + memory + knowledge + documents for a project. */
@Controller('projects/:projectId/search')
export class SearchController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly unified: UnifiedSearchService,
  ) {}

  @Get()
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('q') q: string,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.unified.search(q ?? '', { projectId, limit: 10 });
  }
}
