import type { IndexQueue } from '@brain-dock/core';
import { CODE_COLLECTION } from '@brain-dock/search';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { INDEX_QUEUE_PORT } from './index-queue';
import type { CreateRepositoryDto, UpdateRepositoryDto } from './repositories.dto';

/** Repositories are owned through their project — every method verifies project ownership first. */
@Injectable()
export class RepositoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    @Inject(INDEX_QUEUE_PORT) private readonly queue: IndexQueue,
  ) {}

  async create(user: AuthenticatedUser, projectId: string, dto: CreateRepositoryDto) {
    await this.projects.getOwned(user, projectId);
    const existing = await this.prisma.client.repository.findUnique({
      where: { projectId_alias: { projectId, alias: dto.alias } },
    });
    if (existing) throw new ConflictException('Repository alias already exists in this project');

    const repository = await this.prisma.client.repository.create({
      data: {
        projectId,
        name: dto.name,
        alias: dto.alias,
        root: dto.root,
        defaultBranch: dto.defaultBranch ?? null,
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'repository.create',
      targetType: 'Repository',
      targetId: repository.id,
    });
    return repository;
  }

  async list(user: AuthenticatedUser, projectId: string) {
    await this.projects.getOwned(user, projectId);
    return this.prisma.client.repository.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthenticatedUser, projectId: string, id: string) {
    await this.projects.getOwned(user, projectId);
    const repository = await this.prisma.client.repository.findUnique({ where: { id } });
    if (!repository || repository.projectId !== projectId) {
      throw new NotFoundException('Repository not found');
    }
    return repository;
  }

  async update(user: AuthenticatedUser, projectId: string, id: string, dto: UpdateRepositoryDto) {
    await this.get(user, projectId, id);
    const repository = await this.prisma.client.repository.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.root !== undefined ? { root: dto.root } : {}),
        ...(dto.defaultBranch !== undefined ? { defaultBranch: dto.defaultBranch } : {}),
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'repository.update',
      targetType: 'Repository',
      targetId: id,
    });
    return repository;
  }

  async remove(user: AuthenticatedUser, projectId: string, id: string) {
    await this.get(user, projectId, id);
    await this.prisma.client.repository.delete({ where: { id } });
    await this.audit.log({
      actorId: user.id,
      action: 'repository.delete',
      targetType: 'Repository',
      targetId: id,
    });
    return { id, deleted: true };
  }

  /** Enqueue an indexing job for the repository (consumed by the index worker). */
  async reindex(user: AuthenticatedUser, projectId: string, id: string) {
    const repository = await this.get(user, projectId, id);
    await this.queue.enqueue({
      projectId,
      rootDir: repository.root,
      collection: CODE_COLLECTION,
      repo: repository.alias,
      repositoryId: repository.id,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'repository.reindex',
      targetType: 'Repository',
      targetId: id,
    });
    return { id, queued: true };
  }
}
