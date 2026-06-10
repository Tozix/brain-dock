import { createHash, randomBytes } from 'node:crypto';
import { ApiKeyStatus } from '@brain-dock/db';
import { Role, roleSatisfies } from '@brain-dock/shared';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { IssueApiKeyDto } from './api-keys.dto';

const KEY_PREFIX = 'bd';

/** Public projection of a key row — the hash (and thus the secret) never leaves the service. */
const KEY_SELECT = {
  id: true,
  name: true,
  description: true,
  prefix: true,
  status: true,
  rateLimit: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issues a new key. Self-service: any user issues keys for themselves; ADMIN+ may target
   * another user (`userId`) and set a per-key `rateLimit`. Only the full secret returned here
   * can be used — it is never stored.
   */
  async issue(actor: AuthenticatedUser, dto: IssueApiKeyDto) {
    const isAdmin = roleSatisfies(actor.role, Role.ADMIN);
    if (dto.userId && dto.userId !== actor.id && !isAdmin) {
      throw new ForbiddenException('Only admins can issue keys for other users');
    }
    if (dto.rateLimit !== undefined && !isAdmin) {
      throw new ForbiddenException('Only admins can set a custom rate limit');
    }

    const secret = `${KEY_PREFIX}_${randomBytes(24).toString('hex')}`;
    const prefix = secret.slice(0, 10);
    const userId = dto.userId ?? actor.id;

    const created = await this.prisma.client.apiKey.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        prefix,
        keyHash: hashKey(secret),
        userId,
        rateLimit: dto.rateLimit ?? null,
        expiresAt: dto.expiresAt ?? null,
      },
    });

    await this.audit.log({
      actorId: actor.id,
      action: 'apikey.issue',
      targetType: 'ApiKey',
      targetId: created.id,
    });

    // `key` is shown exactly once.
    return { id: created.id, name: created.name, prefix, key: secret };
  }

  /** `all=true` (ADMIN+) lists every key with its owner's email; otherwise the caller's own. */
  async list(actor: AuthenticatedUser, page: { take: number; skip: number }, all = false) {
    if (!all) return await this.listForUser(actor.id, page);
    if (!roleSatisfies(actor.role, Role.ADMIN)) {
      throw new ForbiddenException('Only admins can list all keys');
    }
    return await this.prisma.client.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      take: page.take,
      skip: page.skip,
      select: { ...KEY_SELECT, userId: true, user: { select: { email: true } } },
    });
  }

  async listForUser(userId: string, page?: { take: number; skip: number }) {
    return await this.prisma.client.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: page?.take ?? 100,
      skip: page?.skip ?? 0,
      select: KEY_SELECT,
    });
  }

  /** Revokes the caller's own key; ADMIN+ may revoke anyone's. Strangers get the same 404. */
  async revoke(actor: AuthenticatedUser, id: string) {
    const key = await this.prisma.client.apiKey.findUnique({ where: { id } });
    // A foreign key id 404s for non-admins — existence is not leaked.
    if (!key || (key.userId !== actor.id && !roleSatisfies(actor.role, Role.ADMIN))) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.client.apiKey.update({
      where: { id },
      data: { status: ApiKeyStatus.REVOKED },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'apikey.revoke',
      targetType: 'ApiKey',
      targetId: id,
    });
    return { id, status: ApiKeyStatus.REVOKED };
  }

  /** Resolves an incoming raw key to its active record (used by the auth guard). */
  async resolveActive(rawKey: string) {
    const key = await this.prisma.client.apiKey.findUnique({
      where: { keyHash: hashKey(rawKey) },
    });
    if (!key || key.status !== ApiKeyStatus.ACTIVE) return null;
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;

    // Refresh lastUsedAt at most once a minute, off the request's hot path (fire-and-forget).
    if (Date.now() - (key.lastUsedAt?.getTime() ?? 0) > 60_000) {
      this.prisma.client.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(console.error);
    }
    return key;
  }

  /** Resolve a raw API key to its owner principal (active key + active user), or null. */
  async resolvePrincipal(rawKey: string): Promise<AuthenticatedUser | null> {
    const key = await this.resolveActive(rawKey);
    if (!key) return null;
    const user = await this.prisma.client.user.findUnique({ where: { id: key.userId } });
    if (!user?.isActive) return null;
    return { id: user.id, email: user.email, role: user.role };
  }
}
