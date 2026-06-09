import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type CreateProjectDto, createProjectSchema } from './projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectDto,
  ) {
    return this.projects.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.projects.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.getOwned(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.remove(user, id);
  }
}
