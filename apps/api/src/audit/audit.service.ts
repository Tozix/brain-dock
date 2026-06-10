import type { Prisma } from '@brain-dock/db';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

/** Append-only audit trail (see Claude.md "AUTH" / "Audit Log"). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  }

  /** Newest-first audit entries, optionally filtered by actor/action/time range. */
  async list(filter: {
    actorId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    take: number;
    skip: number;
  }) {
    return await this.prisma.client.auditLog.findMany({
      where: {
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.from || filter.to
          ? {
              createdAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.take,
      skip: filter.skip,
    });
  }
}
