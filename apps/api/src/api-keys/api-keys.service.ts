import { createHash, randomBytes } from 'node:crypto';
import { ApiKeyStatus } from '@brain-dock/db';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { IssueApiKeyDto } from './api-keys.dto';

const KEY_PREFIX = 'bd';

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Issues a new key. Only the full secret returned here can be used — it is never stored. */
  async issue(actor: AuthenticatedUser, dto: IssueApiKeyDto) {
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

  async listForUser(userId: string, page?: { take: number; skip: number }) {
    return await this.prisma.client.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: page?.take ?? 100,
      skip: page?.skip ?? 0,
      select: {
        id: true,
        name: true,
        description: true,
        prefix: true,
        status: true,
        rateLimit: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(actor: AuthenticatedUser, id: string) {
    const key = await this.prisma.client.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');

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
