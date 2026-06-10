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
import { VectorCleanupService } from './vector-cleanup.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vectors: VectorCleanupService,
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

  async list(user: AuthenticatedUser, page?: { take: number; skip: number }) {
    return await this.prisma.client.project.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: page?.take ?? 100,
      skip: page?.skip ?? 0,
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

  /** The pinned project profile (conventions/facts prepended to generated context). */
  async getProfile(user: AuthenticatedUser, id: string) {
    const project = await this.getOwned(user, id);
    return { id: project.id, profile: project.profile ?? null };
  }

  /** Full-replacement profile update; an empty (or whitespace-only) string clears it. */
  async updateProfile(user: AuthenticatedUser, id: string, profile: string) {
    await this.getOwned(user, id);
    const value = profile.trim() === '' ? null : profile;
    const project = await this.prisma.client.project.update({
      where: { id },
      data: { profile: value },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'project.profile.update',
      targetType: 'Project',
      targetId: id,
    });
    return { id: project.id, profile: project.profile ?? null };
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getOwned(user, id);
    // Postgres rows are removed by FK cascades; vectors need an explicit purge.
    await this.vectors.purgeProject(id);
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
