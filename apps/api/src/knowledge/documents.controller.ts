import { DocumentService } from '@brain-dock/knowledge';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectsService } from '../projects/projects.service';
import { type CreateDocumentDto, createDocumentSchema } from './documents.dto';

@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly documents: DocumentService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createDocumentSchema)) dto: CreateDocumentDto,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.documents.ingest({ projectId, ...dto });
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    await this.projects.getOwned(user, projectId);
    return this.documents.list(projectId);
  }

  @Get('search')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('q') q: string,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.documents.search(projectId, q ?? '', 10);
  }
}
