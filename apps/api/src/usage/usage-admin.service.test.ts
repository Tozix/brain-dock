import { describe, expect, it } from 'bun:test';
import { UsageAdminService } from './usage-admin.service';

type DailyRow = { userId: string; day: Date; calls: number; tokensServed: number };
type UserRow = { id: string; email: string };

/** Start of a UTC day, `daysAgo` days back (mirrors the service's bucketing). */
function utcDay(daysAgo: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
}

/** Minimal Prisma double: real `groupBy` semantics over in-memory daily rows. */
function fakePrisma(daily: DailyRow[], users: UserRow[] = []) {
  const groupByArgs: Array<{ where: { day: { gte: Date } } }> = [];
  return {
    groupByArgs,
    client: {
      mcpUsageDaily: {
        groupBy: async (args: { where: { day: { gte: Date } } }) => {
          groupByArgs.push(args);
          const sums = new Map<string, { calls: number; tokensServed: number }>();
          for (const row of daily) {
            if (row.day.getTime() < args.where.day.gte.getTime()) continue;
            const acc = sums.get(row.userId) ?? { calls: 0, tokensServed: 0 };
            acc.calls += row.calls;
            acc.tokensServed += row.tokensServed;
            sums.set(row.userId, acc);
          }
          return [...sums.entries()]
            .map(([userId, s]) => ({ userId, _sum: s }))
            .sort((a, b) => b._sum.calls - a._sum.calls);
        },
      },
      user: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          users.filter((u) => where.id.in.includes(u.id)),
      },
    },
  };
}

const make = (prisma: ReturnType<typeof fakePrisma>) =>
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  new UsageAdminService(prisma as any);

const page = { take: 100, skip: 0 };

describe('UsageAdminService.perUser', () => {
  it('aggregates per user, sorts by calls desc, and resolves emails', async () => {
    const prisma = fakePrisma(
      [
        { userId: 'u1', day: utcDay(0), calls: 2, tokensServed: 200 },
        { userId: 'u1', day: utcDay(1), calls: 3, tokensServed: 300 },
        { userId: 'u2', day: utcDay(0), calls: 10, tokensServed: 50 },
      ],
      [
        { id: 'u1', email: 'one@x.io' },
        { id: 'u2', email: 'two@x.io' },
      ],
    );
    const report = await make(prisma).perUser(30, page);

    expect(report.users).toEqual([
      { userId: 'u2', email: 'two@x.io', calls: 10, tokensServed: 50 },
      { userId: 'u1', email: 'one@x.io', calls: 5, tokensServed: 500 },
    ]);
    expect(report.summary).toEqual({ totalCalls: 15, totalTokens: 550, activeUsers: 2 });
    expect(report.days).toBe(30);
  });

  it('limits the lookback window to the requested days', async () => {
    const prisma = fakePrisma(
      [
        { userId: 'u1', day: utcDay(0), calls: 1, tokensServed: 10 },
        { userId: 'u1', day: utcDay(6), calls: 1, tokensServed: 10 },
        { userId: 'u1', day: utcDay(7), calls: 100, tokensServed: 1000 }, // outside a 7-day window
      ],
      [{ id: 'u1', email: 'one@x.io' }],
    );
    const report = await make(prisma).perUser(7, page);
    expect(report.summary.totalCalls).toBe(2);
    expect(prisma.groupByArgs[0]?.where.day.gte).toEqual(utcDay(6));
  });

  it('paginates the per-user rows while the summary covers everyone', async () => {
    const prisma = fakePrisma(
      [
        { userId: 'u1', day: utcDay(0), calls: 3, tokensServed: 30 },
        { userId: 'u2', day: utcDay(0), calls: 2, tokensServed: 20 },
        { userId: 'u3', day: utcDay(0), calls: 1, tokensServed: 10 },
      ],
      [
        { id: 'u1', email: 'one@x.io' },
        { id: 'u2', email: 'two@x.io' },
        { id: 'u3', email: 'three@x.io' },
      ],
    );
    const report = await make(prisma).perUser(30, { take: 1, skip: 1 });
    expect(report.users).toEqual([{ userId: 'u2', email: 'two@x.io', calls: 2, tokensServed: 20 }]);
    expect(report.summary).toEqual({ totalCalls: 6, totalTokens: 60, activeUsers: 3 });
  });

  it('reports a deleted owner as email: null and handles an empty period', async () => {
    const withOrphan = fakePrisma([{ userId: 'ghost', day: utcDay(0), calls: 1, tokensServed: 1 }]);
    const report = await make(withOrphan).perUser(30, page);
    expect(report.users).toEqual([{ userId: 'ghost', email: null, calls: 1, tokensServed: 1 }]);

    const empty = await make(fakePrisma([])).perUser(30, page);
    expect(empty.users).toEqual([]);
    expect(empty.summary).toEqual({ totalCalls: 0, totalTokens: 0, activeUsers: 0 });
  });
});
