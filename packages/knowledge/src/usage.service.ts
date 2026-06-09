import type { PrismaClient } from '@brain-dock/db';

export interface UsageSummary {
  days: number;
  calls: number;
  tokensServed: number;
  estTokensSaved: number;
  avgSavingPct: number;
}

// Context capsules / structural results are far smaller than the raw file reads they replace. We
// measure what we DID send (tokensServed, real) and estimate the saving conservatively at this
// ratio (≈5× smaller ⇒ ~80% saved). Surfaced as "est." in the UI; tune as real baselines arrive.
const SAVING_RATIO = 4;

/** Start of a UTC day, `daysAgo` days back. Matches the `@db.Date` column granularity. */
function startOfUtcDay(daysAgo = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
}

/** Records and reports per-user MCP usage rolled up by day. */
export class UsageService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Increment today's call count + tokens served for a user (best-effort, idempotent upsert). */
  async record(userId: string, tokensServed: number): Promise<void> {
    const day = startOfUtcDay();
    await this.prisma.mcpUsageDaily.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, calls: 1, tokensServed },
      update: { calls: { increment: 1 }, tokensServed: { increment: tokensServed } },
    });
  }

  /** Aggregate usage over the last `days` days (inclusive of today). */
  async summary(userId: string, days: number): Promise<UsageSummary> {
    const rows = await this.prisma.mcpUsageDaily.findMany({
      where: { userId, day: { gte: startOfUtcDay(Math.max(days, 1) - 1) } },
    });
    const calls = rows.reduce((n, r) => n + r.calls, 0);
    const tokensServed = rows.reduce((n, r) => n + r.tokensServed, 0);
    const estTokensSaved = tokensServed * SAVING_RATIO;
    const total = tokensServed + estTokensSaved;
    const avgSavingPct = total > 0 ? Math.round((estTokensSaved / total) * 100) : 0;
    return { days, calls, tokensServed, estTokensSaved, avgSavingPct };
  }
}
