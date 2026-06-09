import { describe, expect, it } from 'bun:test';
import { UsageService } from './usage.service';

// Minimal prisma double: captures upserts and serves a fixed findMany result.
function fakePrisma(rows: Array<{ calls: number; tokensServed: number }>) {
  const upserts: unknown[] = [];
  const prisma = {
    mcpUsageDaily: {
      upsert: async (args: unknown) => {
        upserts.push(args);
      },
      findMany: async () => rows,
    },
    // biome-ignore lint/suspicious/noExplicitAny: prisma test double.
  } as any;
  return { prisma, upserts };
}

describe('UsageService.summary', () => {
  it('sums calls/tokens and estimates savings', async () => {
    const { prisma } = fakePrisma([
      { calls: 3, tokensServed: 1000 },
      { calls: 2, tokensServed: 500 },
    ]);
    const svc = new UsageService(prisma);
    const s = await svc.summary('u1', 30);
    expect(s.calls).toBe(5);
    expect(s.tokensServed).toBe(1500);
    expect(s.days).toBe(30);
  });

  it('reports zeros with no usage', async () => {
    const { prisma } = fakePrisma([]);
    const s = await new UsageService(prisma).summary('u1', 7);
    expect(s).toEqual({ days: 7, calls: 0, tokensServed: 0 });
  });
});

describe('UsageService.record', () => {
  it('upserts an increment for the user', async () => {
    const { prisma, upserts } = fakePrisma([]);
    await new UsageService(prisma).record('u1', 42);
    expect(upserts).toHaveLength(1);
    const arg = upserts[0] as { create: { userId: string; tokensServed: number } };
    expect(arg.create.userId).toBe('u1');
    expect(arg.create.tokensServed).toBe(42);
  });
});
