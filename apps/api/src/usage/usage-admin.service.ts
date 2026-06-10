import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Start of a UTC day, `daysAgo` days back — matches McpUsageDaily's `@db.Date` granularity. */
function startOfUtcDay(daysAgo = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
}

export interface AdminUsageRow {
  userId: string;
  email: string | null;
  calls: number;
  tokensServed: number;
}

export interface AdminUsageReport {
  days: number;
  summary: { totalCalls: number; totalTokens: number; activeUsers: number };
  users: AdminUsageRow[];
}

/** Platform-wide MCP usage rollup per user (admin dashboard). */
@Injectable()
export class UsageAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-user totals over the last `days` days, sorted by calls desc, plus a global summary. */
  async perUser(days: number, page: { take: number; skip: number }): Promise<AdminUsageReport> {
    const since = startOfUtcDay(Math.max(days, 1) - 1);
    // One groupBy serves both the page and the summary (user counts stay small).
    const groups = await this.prisma.client.mcpUsageDaily.groupBy({
      by: ['userId'],
      where: { day: { gte: since } },
      _sum: { calls: true, tokensServed: true },
      orderBy: { _sum: { calls: 'desc' } },
    });

    const summary = {
      totalCalls: groups.reduce((n, g) => n + (g._sum.calls ?? 0), 0),
      totalTokens: groups.reduce((n, g) => n + (g._sum.tokensServed ?? 0), 0),
      activeUsers: groups.length,
    };

    const pageGroups = groups.slice(page.skip, page.skip + page.take);
    const owners = await this.prisma.client.user.findMany({
      where: { id: { in: pageGroups.map((g) => g.userId) } },
      select: { id: true, email: true },
    });
    const emailById = new Map(owners.map((u) => [u.id, u.email]));

    return {
      days,
      summary,
      users: pageGroups.map((g) => ({
        userId: g.userId,
        email: emailById.get(g.userId) ?? null,
        calls: g._sum.calls ?? 0,
        tokensServed: g._sum.tokensServed ?? 0,
      })),
    };
  }
}
