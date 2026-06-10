import { DocumentService } from '@brain-dock/knowledge';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { type PaginationDto, paginationSchema } from '../common/pagination';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectsService } from '../projects/projects.service';
import {
  type CreateDocumentDto,
  createDocumentSchema,
  type UpdateDocumentDto,
  updateDocumentSchema,
} from './documents.dto';

@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly documents: DocumentService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createDocumentSchema)) dto: CreateDocumentDto,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.documents.ingest({ projectId, ...dto });
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(paginationSchema)) page: PaginationDto,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.documents.list(projectId, page);
  }

  @Get('search')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('q') q: string,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.documents.search(projectId, q ?? '', 10);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) dto: UpdateDocumentDto,
  ) {
    await this.projects.getOwned(user, projectId);
    const result = await this.documents.update(projectId, id, dto);
    if (!result) throw new NotFoundException('Document not found');
    return result;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.projects.getOwned(user, projectId);
    if (!(await this.documents.delete(projectId, id)))
      throw new NotFoundException('Document not found');
    return { id, deleted: true };
  }
}
