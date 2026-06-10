import { Role, roleSatisfies } from '@brain-dock/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateUserDto } from './users.dto';

/** Public projection of a user row — `passwordHash` must never leave this service. */
const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  _count: { select: { projects: true, apiKeys: true } },
} as const;

/** Admin-only user management (powers the web admin area). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: { q?: string; take: number; skip: number }) {
    return await this.prisma.client.user.findMany({
      where: query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {},
      orderBy: { createdAt: 'desc' },
      take: query.take,
      skip: query.skip,
      select: USER_SELECT,
    });
  }

  async get(id: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Admin update of a user:
   * - `isActive` — ADMIN+, but never on yourself (you would lock yourself out);
   * - `role` — SUPER_ADMIN only (covers granting SUPER_ADMIN too), never on yourself.
   */
  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.client.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    if (dto.isActive !== undefined && id === actor.id) {
      throw new BadRequestException('cannot deactivate yourself');
    }
    if (dto.role !== undefined) {
      if (!roleSatisfies(actor.role, Role.SUPER_ADMIN)) {
        throw new ForbiddenException('Only SUPER_ADMIN can change roles');
      }
      if (id === actor.id) throw new BadRequestException('cannot change your own role');
    }

    const updated = await this.prisma.client.user.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
      },
      select: USER_SELECT,
    });

    await this.audit.log({
      actorId: actor.id,
      action: 'user.update',
      targetType: 'User',
      targetId: id,
      metadata: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
      },
    });
    return updated;
  }
}
