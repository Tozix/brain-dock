import {
  KnowledgeService,
  type UpdateKnowledgeInput,
  updateKnowledgeSchema,
} from '@brain-dock/knowledge';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectsService } from '../projects/projects.service';
import { type CreateKnowledgeDto, createKnowledgeSchema } from './knowledge.dto';

@Controller('projects/:projectId/knowledge')
export class KnowledgeController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createKnowledgeSchema)) dto: CreateKnowledgeDto,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.knowledge.save({ projectId, ...dto });
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    await this.projects.getOwned(user, projectId);
    return this.knowledge.list(projectId);
  }

  @Get('search')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('q') q: string,
  ) {
    await this.projects.getOwned(user, projectId);
    return this.knowledge.search(projectId, q ?? '', 10);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateKnowledgeSchema)) dto: UpdateKnowledgeInput,
  ) {
    await this.projects.getOwned(user, projectId);
    const item = await this.knowledge.update(projectId, id, dto);
    if (!item) throw new NotFoundException('Knowledge not found');
    return item;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    await this.projects.getOwned(user, projectId);
    if (!(await this.knowledge.delete(projectId, id)))
      throw new NotFoundException('Knowledge not found');
    return { id, deleted: true };
  }
}
