import { MemoryService, type UpdateMemoryInput, updateMemorySchema } from '@brain-dock/knowledge';
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
import { type CreateMemoryDto, createMemorySchema } from './knowledge.dto';

@Controller('projects/:projectId/memory')
export class MemoryController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly memory: MemoryService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createMemorySchema)) dto: CreateMemoryDto,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.memory.remember({ projectId, ...dto });
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(paginationSchema)) page: PaginationDto,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.memory.list(projectId, page);
  }

  @Get('search')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('q') q: string,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.memory.search(projectId, q ?? '', 10);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMemorySchema)) dto: UpdateMemoryInput,
  ) {
    await this.projects.getOwned(user, projectId);
    const item = await this.memory.update(projectId, id, dto);
    if (!item) throw new NotFoundException('Memory not found');
    return item;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.projects.getOwned(user, projectId);
    if (!(await this.memory.delete(projectId, id))) throw new NotFoundException('Memory not found');
    return { id, deleted: true };
  }
}
