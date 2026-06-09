import { Role, roleSatisfies } from '@brain-dock/shared';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './projects.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateProjectDto) {
    const existing = await this.prisma.client.project.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Project slug already exists');

    const project = await this.prisma.client.project.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        ownerId: user.id,
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'project.create',
      targetType: 'Project',
      targetId: project.id,
    });
    return project;
  }

  async list(user: AuthenticatedUser) {
    return await this.prisma.client.project.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Fetch a project the user owns (ADMIN/SUPER_ADMIN may access any). */
  async getOwned(user: AuthenticatedUser, id: string) {
    const project = await this.prisma.client.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== user.id && !roleSatisfies(user.role, Role.ADMIN)) {
      throw new ForbiddenException('Not your project');
    }
    return project;
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getOwned(user, id);
    await this.prisma.client.project.delete({ where: { id } });
    await this.audit.log({
      actorId: user.id,
      action: 'project.delete',
      targetType: 'Project',
      targetId: id,
    });
    return { id, deleted: true };
  }
}
